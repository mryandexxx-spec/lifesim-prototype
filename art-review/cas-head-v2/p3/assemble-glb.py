"""Install Blender-authored geometry on the byte-preserved original glTF rig."""
import argparse
from copy import deepcopy
import json
from pathlib import Path
import struct


FAMILIES = {'alex': 'meshy-casual-v1.glb', 'mira': 'meshy-mira-mobile-v1.glb'}
ROOT = Path(__file__).resolve().parents[3]
UINT = {5121: 'B', 5123: 'H', 5125: 'I'}
SIZES = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
SHAPES = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def read_glb(path):
    data = path.read_bytes()
    magic, version, total, size, chunk_type = struct.unpack_from('<4sIII4s', data)
    if (magic, version, total, chunk_type) != (b'glTF', 2, len(data), b'JSON'):
        raise ValueError(f'Invalid GLB input: {path}')
    length, kind = struct.unpack_from('<I4s', data, 20 + size)
    if kind != b'BIN\x00' or length != len(data) - size - 28:
        raise ValueError(f'Invalid BIN chunk: {path}')
    return json.loads(data[20:20+size]), bytearray(data[28+size:])


def write_glb(path, doc, binary):
    binary.extend(b'\0' * (-len(binary) % 4))
    doc['buffers'][0]['byteLength'] = len(binary)
    encoded = json.dumps(doc, ensure_ascii=False, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    header = struct.pack('<4sIII4s', b'glTF', 2, 28+len(encoded)+len(binary), len(encoded), b'JSON')
    path.write_bytes(header + encoded + struct.pack('<I4s', len(binary), b'BIN\x00') + binary)


def append_view(doc, binary, data, template=None):
    binary.extend(b'\0' * (-len(binary) % 4))
    views = doc['bufferViews']
    view = {**(template or {}), 'buffer': 0, 'byteOffset': len(binary), 'byteLength': len(data)}
    views.append(view)
    binary.extend(data)
    return len(views)-1


def unpack_view(doc, binary, index):
    view = doc['bufferViews'][index]
    start = view.get('byteOffset', 0)
    if view['buffer'] != 0:
        raise ValueError('Embedded GLB buffer is required')
    return memoryview(binary)[start:start+view['byteLength']]


def dense_accessor(doc, binary, accessor):
    width = SIZES[accessor['componentType']] * SHAPES[accessor['type']]
    array = bytearray(accessor['count'] * width)
    if 'bufferView' in accessor:
        view_index = accessor['bufferView']
        data = unpack_view(doc, binary, view_index)
        stride = doc['bufferViews'][view_index].get('byteStride', width)
        start = accessor.get('byteOffset', 0)
        for i in range(accessor['count']):
            array[i*width:(i+1)*width] = data[start+i*stride:start+i*stride+width]
    sparse = accessor.get('sparse')
    if sparse:
        indices, values = sparse['indices'], sparse['values']
        data_i = unpack_view(doc, binary, indices['bufferView'])[indices.get('byteOffset', 0):]
        data_v = unpack_view(doc, binary, values['bufferView'])[values.get('byteOffset', 0):]
        fmt = '<' + UINT[indices['componentType']]
        for i in range(sparse['count']):
            dst, = struct.unpack_from(fmt, data_i, i*struct.calcsize(fmt))
            if dst >= accessor['count']:
                raise ValueError('Blender emitted out-of-range sparse indices')
            array[dst*width:(dst+1)*width] = data_v[i*width:(i+1)*width]
    return array


def joint_indices(doc, skin):
    return [doc['nodes'][i]['name'] for i in skin['joints']]


def assert_identity(node):
    for key, expected in {'translation': [0, 0, 0], 'rotation': [0, 0, 0, 1], 'scale': [1, 1, 1]}.items():
        if max(abs(a-b) for a, b in zip(node.get(key, expected), expected)) > 1e-6:
            raise ValueError(f'Skin mesh transform not in the original bind space: {node}')
    if 'matrix' in node:
        raise ValueError(f'Unexpected bind space transform: {node}')


def assemble(source, authored, output):
    doc, binary = read_glb(source)
    model, data = read_glb(authored)
    source_node = next(n for n in doc['nodes'] if 'mesh' in n)
    source_skin = source_node['skin']
    mesh_parent = next(n for n in doc['nodes'] if doc['nodes'].index(source_node) in n.get('children', []))
    assert_identity(source_node)
    assert_identity(mesh_parent)
    kept_joints = joint_indices(doc, doc['skins'][source_skin])
    used_extensions = sorted(set(doc.get('extensionsUsed', [])) | set(model.get('extensionsUsed', [])))
    if used_extensions:
        doc['extensionsUsed'] = used_extensions
    indices = {name: {} for name in ('accessors', 'bufferViews', 'images', 'samplers', 'textures', 'materials')}
    original_body_material = doc['meshes'][source_node['mesh']]['primitives'][0]['material']

    def copy_resource(kind, index, remap=None):
        memo = indices[kind]
        key = (index, remap)
        if key in memo:
            return memo[key]
        resource = deepcopy(model[kind][index])
        if kind == 'bufferViews':
            template = resource
            result = append_view(doc, binary, unpack_view(model, data, index), template)
        else:
            if kind == 'accessors':
                if resource.get('sparse') or remap is not None:
                    payload = dense_accessor(model, data, resource)
                    if remap is not None:
                        fmt = '<' + UINT[resource['componentType']]
                        step = struct.calcsize(fmt)
                        for offset in range(0, len(payload), step):
                            old, = struct.unpack_from(fmt, payload, offset)
                            struct.pack_into(fmt, payload, offset, remap[old])
                    resource['bufferView'] = append_view(doc, binary, payload, {'target': 34962})
                    resource.pop('sparse', None)
                    resource.pop('byteOffset', None)
                    if remap is not None:
                        resource.pop('min', None)
                        resource.pop('max', None)
                elif 'bufferView' in resource:
                    resource['bufferView'] = copy_resource('bufferViews', resource['bufferView'])
            elif kind == 'images':
                resource['bufferView'] = copy_resource('bufferViews', resource['bufferView'])
            elif kind == 'textures':
                resource['source'] = copy_resource('images', resource['source'])
                if 'sampler' in resource:
                    resource['sampler'] = copy_resource('samplers', resource['sampler'])
            elif kind == 'materials':
                def reindex_textures(entry):
                    for key, value in entry.items():
                        if key.endswith('Texture') and isinstance(value, dict) and 'index' in value:
                            value['index'] = copy_resource('textures', value['index'])
                        elif isinstance(value, dict):
                            reindex_textures(value)
                reindex_textures(resource)
            dest = doc.setdefault(kind, [])
            result = len(dest)
            dest.append(resource)
        memo[key] = result
        return result

    body_found = False
    original_mesh = source_node['mesh']
    for node in model['nodes']:
        if 'mesh' not in node:
            continue
        assert_identity(node)
        joint_names = joint_indices(model, model['skins'][node['skin']])
        if set(joint_names) != set(kept_joints) or len(kept_joints) != 66:
            raise ValueError('Blender joint order could not be mapped to the 66 original joints')
        remap = tuple(kept_joints.index(name) for name in joint_names)
        mesh = deepcopy(model['meshes'][node['mesh']])
        body = node['name'].startswith('Original body below')
        for primitive in mesh['primitives']:
            primitive['attributes'] = {name: copy_resource('accessors', index, remap if name == 'JOINTS_0' else None)
                                       for name, index in primitive['attributes'].items()}
            primitive['indices'] = copy_resource('accessors', primitive['indices'])
            primitive['material'] = original_body_material if body else copy_resource('materials', primitive['material'])
            if 'targets' in primitive:
                primitive['targets'] = [{channel: copy_resource('accessors', index) for channel, index in target.items()}
                                        for target in primitive['targets']]
        if body:
            if body_found:
                raise ValueError('Multiple clipped resident bodies')
            body_found = True
            doc['meshes'][original_mesh] = mesh
        else:
            mesh_index = len(doc['meshes'])
            doc['meshes'].append(mesh)
            mesh_parent['children'].append(len(doc['nodes']))
            doc['nodes'].append({'mesh': mesh_index, 'name': node['name'], 'skin': source_skin})
    if not body_found:
        raise ValueError('Missing clipped resident body')
    doc['asset']['generator'] = 'Blender / LifeSim CAS-HEAD-V2-P3'
    doc.setdefault('extras', {}).update({'productionReady': False, 'ownerArtApproved': False})
    write_glb(output, doc, binary)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('exports', type=Path)
    parser.add_argument('destination', type=Path)
    options = parser.parse_args()
    options.destination.mkdir(parents=True, exist_ok=True)
    for family, filename in FAMILIES.items():
        assemble(ROOT / 'assets/characters' / filename, options.exports / f'{family}-blender.glb',
                 options.destination / f'{family}-p3.glb')


if __name__ == '__main__':
    main()
