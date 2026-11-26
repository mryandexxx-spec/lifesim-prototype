"""Independent periodic velocity metrics, parent-coordinate SO(3) logarithms."""
import numpy as np
from scipy.spatial.transform import Rotation

def seam_vectors(samples,dt,stride):
    assert len(samples)==4 and dt>0
    p=np.asarray([s[0] for s in samples],float)
    q=np.asarray([s[1] for s in samples],float)
    assert np.isfinite(p).all() and np.isfinite(q).all()
    assert np.all(np.linalg.norm(q,axis=-1)>0)
    rot=[Rotation.from_quat(a[:,[1,2,3,0]]) for a in q]
    outgoing=(rot[1]*rot[0].inv()).as_rotvec()/dt
    incoming=(rot[3]*rot[2].inv()).as_rotvec()/dt
    tiled=(rot[0]*rot[2].inv()).as_rotvec()/dt
    v=(p[1]-p[0])/dt
    return np.asarray([np.vstack([v-(p[3]-p[2])/dt,outgoing-incoming]),
                       np.vstack([v-(p[0]+stride-p[2])/dt,outgoing-tiled])])

def norms(v):return np.linalg.norm(v,axis=-1)

def limits_for(base):
    caps=np.maximum(.25,norms(base)+.10)
    caps[0]=.10
    return caps

def self_test():
    dt=.1;stride=np.array([1.,0,0])
    def sample(x,angle):
        q=Rotation.from_rotvec([[0,0,angle]]).as_quat()
        return np.array([x,0,0]),q[:,[3,0,1,2]]
    seq=[sample(0,0),sample(.1,.2),sample(.9,-.2),sample(1,0)]
    assert np.max(norms(seam_vectors(seq,dt,stride)))<1e-12
    seq[3]=sample(1.03,.15)
    v=seam_vectors(seq,dt,stride)
    assert np.allclose(norms(v)[0],[.3,1.5])
    assert np.max(norms(v)[1])<1e-12
    seq[0]=(seq[0][0],-seq[0][1])
    assert np.allclose(v,seam_vectors(seq,dt,stride))
    assert np.allclose(limits_for(v[0]),[.10,1.6])
    print("C1 metric controls PASS")
if __name__=="__main__":self_test()
