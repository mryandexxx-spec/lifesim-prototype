"""FBIK R1 capability comparison on frozen real rigs; not a production solver."""
import sys, pathlib, json, math, tempfile, subprocess, shutil, time
import xml.etree.ElementTree as ET
import numpy as np
import bpy
import mujoco
import mink
import qpsolvers
import osqp
import clarabel
from scipy import sparse
from mink.limits.limit import Limit, Constraint
from mathutils import Vector, Matrix, Quaternion
sys.path.insert(0,str(pathlib.Path("prior-code/tools").resolve()))
from cf_anim_tools import import_rig, reset, locals_, matrix, encode, setup, digest, Y, get_ffmpeg_exe
from cf_anim_contacts import (read, world, pos, unit, clone, move_root, regions, sole, surface,
    ear_candidates, palm, fingers, finger_map, contact_windows, stance_travel, seat_axes,
    oriented_seat, seat_overlap, proxy, smooth, ik)
OUT=pathlib.Path("fbik-out");OUT.mkdir(exist_ok=True)

def nums(v):return " ".join(str(float(x)) for x in v)
def transform(p,q):
    return Matrix.Translation(p)@q.to_matrix().to_4x4()
def ancestor_set(t,ids):
    result=set()
    for i in ids:
        while i>=0:
            result.add(i);i=t["parents"][i]
    return result

def native(arm,bones,rest,t,bf,goals):
    # Native multi-effector constraints evaluated together, not sequential limb edits.
    arm.pose.ik_solver="ITASC"
    apply(arm,bones,rest,bf)
    added=[]
    try:
        for i,goal in goals.items():
            obj=bpy.data.objects.new("FBIK target",None);bpy.context.collection.objects.link(obj)
            obj.matrix_world=Y.inverted()@goal
            b=bones[i];con=b.constraints.new("IK");con.target=obj;con.use_tail=False
            con.chain_count=0;con.use_location=True;con.use_rotation=True
            con.use_stretch=False;con.weight=1.;con.orient_weight=.35
            added.append((b,con,obj))
        bpy.context.view_layer.update()
        deps=bpy.context.evaluated_depsgraph_get();ea=arm.evaluated_get(deps)
        actual=encode(locals_(ea,list(ea.pose.bones)))
    finally:
        for b,c,o in added:b.constraints.remove(c);bpy.data.objects.remove(o,do_unlink=True)
        bpy.context.view_layer.update()
    return actual

class WeightedSkin:
    """Linear blend skin reconstructed from the GLB bind and every vertex weight."""
    def __init__(self,t,meshes,arm,bones):
        self.t=t;self.reg=[(o,list(range(len(o.data.vertices)))) for o in meshes]
        w=world(t,t["rest"]);inv=[m.inverted() for m in w]
        records=[];audit=[]
        for o in meshes:
            mods=[m for m in o.modifiers if m.type=="ARMATURE" and m.object==arm]
            assert len(mods)==1,(o.name,"armature modifier count")
            mod=mods[0]
            # glTF skinning is linear blend, not Blender's optional dual quaternion.
            # Do not silently change the candidate or its render configuration.
            assert not mod.use_deform_preserve_volume,(o.name,"dual quaternion modifier")
            enabled=mod.show_viewport
            assert enabled and mod.use_vertex_groups and not mod.vertex_group,(o.name,"unsupported modifier setup")
            try:
                mod.show_viewport=False
                bpy.context.view_layer.update()
                dep=bpy.context.evaluated_depsgraph_get();e=o.evaluated_get(dep);me=e.to_mesh()
                try:
                    assert len(me.vertices)==len(o.data.vertices),(o.name,"pre-skin topology changed")
                    points=[Y@e.matrix_world@v.co for v in me.vertices]
                finally:e.to_mesh_clear()
            finally:
                mod.show_viewport=enabled
                bpy.context.view_layer.update()
            raw=[Y@o.matrix_world@v.co for v in o.data.vertices]
            audit.append({"mesh":o.name,"vertices":len(points),"pre_skin_vs_raw_max_m":max((p-q).length for p,q in zip(points,raw)),
                "shape_keys":{k.name:float(k.value) for k in o.data.shape_keys.key_blocks} if o.data.shape_keys else {},
                "modifiers":[m.type for m in o.modifiers]})
            mapping={g.index:t["names"].index(g.name) for g in o.vertex_groups if g.name in t["names"]}
            for v in o.data.vertices:
                p=points[v.index]
                inf=[(mapping[g.group],float(g.weight)) for g in v.groups if g.group in mapping and g.weight>0.]
                assert inf,("unweighted vertex",o.name,v.index)
                total=sum(a for _,a in inf)
                assert abs(total-1.)<.005,("unnormalized skin",total)
                records.append([(i,a/total,list(inv[i]@p)) for i,a in inf])
        n=len(records);k=max(map(len,records));assert n>1000 and k<=8,(n,k)
        self.ids=np.zeros((n,k),dtype=np.int32)
        self.weights=np.zeros((n,k));self.local=np.zeros((n,k,3))
        for j,rec in enumerate(records):
            for z,(i,a,p) in enumerate(rec):
                self.ids[j,z]=i;self.weights[j,z]=a;self.local[j,z]=p
        (OUT/"skin-bind-audit.jsonl").open("a").write(json.dumps({"rig_sha256":t["sha256"],"meshes":audit})+"\n")
    def evaluate(self,rot,trans):
        parts=np.einsum("nkij,nkj->nki",rot[self.ids],self.local)+trans[self.ids]
        return np.einsum("nk,nki->ni",self.weights,parts),parts
    def actual_error(self,f):
        w=world(self.t,f)
        rot=np.array([np.array(m.to_3x3()) for m in w]);trans=np.array([list(m.translation) for m in w])
        predicted,_=self.evaluate(rot,trans)
        actual=np.array([list(p) for p in surface(self.reg)])
        assert actual.shape==predicted.shape
        d=np.linalg.norm(predicted-actual,axis=1)
        return {"max_m":float(d.max()),"p95_m":float(np.percentile(d,95))}

def box_distance(points,seat):
    center,x,front,width,depth,top=seat
    axes=np.array([list(x),[0.,1.,0.],list(front)])
    local=(points-np.array(center))@axes.T
    q=np.abs(local)-np.array([width/2,.05,depth/2])
    exterior=np.maximum(q,0);norm=np.linalg.norm(exterior,axis=1)
    distance=norm+np.minimum(np.max(q,axis=1),0.)
    grad=np.zeros_like(q);outside=norm>1e-10
    grad[outside]=exterior[outside]/norm[outside,None]*np.where(local[outside]>=0,1.,-1.)
    j=np.argmax(q,axis=1);rows=np.flatnonzero(~outside)
    grad[rows,j[rows]]=np.where(local[rows,j[rows]]>=0,1.,-1.)
    return distance,grad@axes

class WeightedSurfaceLimit(Limit):
    """Mink native QP limit, with actual LBS point Jacobians."""
    def __init__(self,model,skin,floor,seat):
        self.model=model;self.skin=skin;self.floor=floor;self.seat=seat
        self.bodies=np.array([model.body(f"b{i}").id for i in range(len(skin.t["names"]))])
        self.calls=0;self.max_rows=0
    def points(self,cfg):
        d=cfg.data;b=self.bodies
        return self.skin.evaluate(d.xmat[b].reshape(-1,3,3),d.xpos[b])
    def point_jac(self,cfg,j,parts):
        a=np.zeros((3,self.model.nv))
        for i,p,w in zip(self.skin.ids[j],parts[j],self.skin.weights[j]):
            if w<=0:continue
            jp=np.zeros_like(a);jr=np.zeros_like(a)
            mujoco.mj_jac(self.model,cfg.data,jp,jr,np.ascontiguousarray(p),int(self.bodies[i]))
            a+=w*jp
        return a
    def compute_qp_inequalities(self,configuration,dt):
        pts,parts=self.points(configuration)
        floor=pts[:,1]-self.floor
        sets=[(floor,np.broadcast_to(np.array([0.,1.,0.]),pts.shape))]
        if self.seat is not None:sets.append(box_distance(pts,self.seat))
        G=[];h=[];self.calls+=1
        for distances,grad in sets:
            ix=np.flatnonzero(distances<.025)
            ix=ix[np.argsort(distances[ix],kind="stable")[:24]]
            for j in ix:
                jac=grad[j]@self.point_jac(configuration,int(j),parts)
                G.append(-jac);h.append(.5*float(distances[j]))
        self.max_rows=max(self.max_rows,len(G))
        return Constraint(np.array(G),np.array(h)) if G else Constraint()
    def derivative_check(self,cfg):
        pts,parts=self.points(cfg)
        j=int(np.argmin(pts[:,1]));jac=self.point_jac(cfg,j,parts)
        direction=np.linspace(-1,1,self.model.nv);direction/=np.linalg.norm(direction)
        q0=cfg.q.copy();q=q0.copy();eps=1e-5
        mujoco.mj_integratePos(self.model,q,direction,eps)
        cfg.update(q);after,_=self.points(cfg)
        err=float(np.linalg.norm((after[j]-pts[j])/eps-jac@direction))
        cfg.update(q0)
        assert err<.002,("weighted point Jacobian replay",err)
        return err

def tangent(model,q0,q):
    d=np.zeros(model.nv);mujoco.mj_differentiatePos(model,d,1.,q0,q)
    return d

def trust_bounds(model):
    # Diagnostic trust region around source pose, not anatomical joint limits.
    step=np.full(model.nv,.06);total=np.full(model.nv,.38)
    for j in range(model.njnt):
        if model.jnt_type[j]==mujoco.mjtJoint.mjJNT_FREE:
            a=int(model.jnt_dofadr[j]);step[a:a+3]=.015;total[a:a+3]=.10
    return step,total

def bounded_step(cfg,tasks,limit,q0,step,total,diag,lower,upper):
    model=cfg.model;n=model.nv
    problem=mink.build_ik(cfg,tasks,.05,damping=.001,limits=[mink.ConfigurationLimit(model)])
    collision=limit.compute_qp_inequalities(cfg,.05)
    m=0 if collision.inactive else len(collision.h)
    # Collision rows are soft via nonnegative slack. All trust bounds remain hard.
    # Penalizing slack in the QP avoids exploding steps when contact goals conflict.
    P=np.zeros((n+m,n+m));P[:n,:n]=problem.P
    if m:P[n:,n:]=np.eye(m)*200.
    q=np.r_[problem.q,np.full(m,2.)]
    G=[];h=[]
    if problem.G is not None:
        G.append(np.c_[problem.G,np.zeros((len(problem.h),m))]);h.append(problem.h)
    if m:
        G.append(np.c_[collision.G,-np.eye(m)]);h.append(collision.h)
        G.append(np.c_[np.zeros((m,n)),-np.eye(m)]);h.append(np.zeros(m))
    d=tangent(model,q0,cfg.q)
    lo=np.maximum(-step,lower-d);hi=np.minimum(step,upper-d)
    G.extend([np.c_[np.eye(n),np.zeros((n,m))],np.c_[-np.eye(n),np.zeros((n,m))]])
    h.extend([hi,-lo])
    G=np.vstack(G);h=np.concatenate(h)
    sol=qpsolvers.solve_qp(P,q,G,h,solver="daqp")
    if sol is None or not np.isfinite(sol).all() or np.max(G@sol-h)>1e-5:
        diag["rejected_qp_steps"]+=1
        return False
    dq=sol[:n];diag["max_slack_m"]=max(diag["max_slack_m"],float(max(0.,np.max(sol[n:]))) if m else 0.)
    # A rotation increment is a tangent, so independently check actual integrated
    # displacement instead of trusting the linear approximation to total bounds.
    current=cfg.q.copy()
    for a in (1.,.5,.25,.125,.0625):
        trial=current.copy();mujoco.mj_integratePos(model,trial,dq,a)
        delta=tangent(model,q0,trial)
        if np.isfinite(trial).all() and np.all(delta>=lower-1e-6) and np.all(delta<=upper+1e-6):
            cfg.update(trial);diag["accepted_steps"]+=1
            return True
    diag["rejected_integration_steps"]+=1
    return False

def qp(t,bf,goals,weighted=None,diagnostic=None,previous=None,frame_dt=None,context_only=False):

    # MJCF built from the actual sampled hierarchy, no robot or borrowed body.
    # The starting pose is the local reference; ball joints preserve segment length.
    root=ET.Element("mujoco",model="LifeSim diagnostic");ET.SubElement(root,"compiler",angle="radian")
    scene=ET.SubElement(root,"worldbody")
    active=ancestor_set(t,goals); nodes=[]
    if weighted:
        skin,floor,seat_info=weighted
        ids=[t["roles"][x+"_"+s] for s in ("l","r") for x in ("thigh","shin","foot")]
        active|=ancestor_set(t,ids+[t["roles"]["hip"]])

    for i,b in enumerate(bf):
        p=t["parents"][i];m=matrix(b["p"],b["r"]);q=m.to_quaternion()
        node=ET.SubElement(scene if p<0 else nodes[p],"body",name=f"b{i}",pos=nums(m.translation),quat=nums(q))
        nodes.append(node)
        if i in active:
            if p<0:ET.SubElement(node,"freejoint",name=f"j{i}")
            else:ET.SubElement(node,"joint",name=f"j{i}",type="ball")
            ET.SubElement(node,"inertial",pos="0 0 0",mass="1",diaginertia=".01 .01 .01")
    model=mujoco.MjModel.from_xml_string(ET.tostring(root,encoding="unicode"))
    cfg=mink.Configuration(model)
    # Validate the conversion before trusting solver numbers.
    before=world(t,bf)
    for i,w in enumerate(before):
        j=model.body(f"b{i}").id
        assert np.linalg.norm(cfg.data.xpos[j]-np.array(w.translation))<.0001,("MJCF position mismatch",i)
        assert abs(np.dot(cfg.data.xquat[j],np.array(w.to_quaternion())))>.99999,("MJCF rotation mismatch",i)
    tasks=[]
    posture=mink.PostureTask(model,cost=.015);posture.set_target_from_configuration(cfg);tasks.append(posture)
    for i,g in goals.items():
        task=mink.FrameTask(f"b{i}","body",position_cost=1.,orientation_cost=.35,lm_damping=.01)
        task.set_target(mink.SE3.from_rotation_and_translation(mink.SO3(np.array(g.to_quaternion())),np.array(g.translation)))
        tasks.append(task)
    limits=None;surface_limit=None
    if weighted:
        surface_limit=WeightedSurfaceLimit(model,skin,floor,seat_info)
        if diagnostic is not None:diagnostic["jacobian_error"]=surface_limit.derivative_check(cfg)
        limits=[mink.ConfigurationLimit(model),surface_limit]
    q0=cfg.q.copy()
    if context_only:return cfg,tasks,surface_limit,q0
    if weighted:
        step,total=trust_bounds(model)
        diagnostic.update({"accepted_steps":0,"rejected_qp_steps":0,"rejected_integration_steps":0,"max_slack_m":0.})
        lower=-total.copy();upper=total.copy()
        signature=[(model.joint(j).name,int(model.jnt_type[j]),int(model.jnt_dofadr[j])) for j in range(model.njnt)]
        diagnostic["joint_layout"]=signature
        if previous is not None:
            assert previous["joint_layout"]==signature,("temporal joint layout changed",signature)
            old=np.asarray(previous["final_tangent"]);assert old.shape==(model.nv,)
            # Limit the rate of correction, not the source animation's own motion.
            # Diagnostic rates; no anatomical joint limit claim.
            rate=np.full(model.nv,1.5)
            for j in range(model.njnt):
                if model.jnt_type[j]==mujoco.mjtJoint.mjJNT_FREE:
                    a=int(model.jnt_dofadr[j]);rate[a:a+3]=.25
            frame_bound=rate*frame_dt
            lower=np.maximum(lower,old-frame_bound);upper=np.minimum(upper,old+frame_bound)
            assert np.all(lower<=upper+1e-8)
            qref=q0.copy();mujoco.mj_integratePos(model,qref,old,1.)
            temporal=mink.PostureTask(model,cost=.20);temporal.set_target(qref);tasks.append(temporal)
            cfg.update(qref)
            diagnostic["warm_start_replay_error"]=float(np.max(np.abs(tangent(model,q0,cfg.q)-old)))
            assert diagnostic["warm_start_replay_error"]<1e-6
    for _ in range(24):
        if weighted:
            if not bounded_step(cfg,tasks,surface_limit,q0,step,total,diagnostic,lower,upper):break
        else:
            vel=mink.solve_ik(cfg,tasks,.05,"daqp",damping=.001,limits=limits)
            assert np.isfinite(vel).all()
            cfg.integrate_inplace(vel,.05)
    if weighted:
        delta=tangent(model,q0,cfg.q)
        assert np.all(np.abs(delta)<=total+1e-6),("trust region",delta)
        diagnostic["max_tangent_bound_ratio"]=float(np.max(np.abs(delta)/total))
        diagnostic["final_tangent"]=delta.tolist()
        assert np.all(delta>=lower-1e-6) and np.all(delta<=upper+1e-6)
        if previous is not None:
            diagnostic["max_temporal_bound_ratio"]=float(np.max(np.abs(delta-old)/frame_bound))
    if diagnostic is not None and surface_limit is not None:
        pts,_=surface_limit.points(cfg)
        diagnostic.update({"constraint_calls":surface_limit.calls,"max_constraint_rows":surface_limit.max_rows,
            "weighted_floor_min_m":float(pts[:,1].min()-floor),
            "weighted_seat_signed_min_m":float(box_distance(pts,seat_info)[0].min()) if seat_info else None})
    ws=[]
    for i in range(len(bf)):
        j=model.body(f"b{i}").id
        ws.append(transform(Vector(cfg.data.xpos[j]),Quaternion(cfg.data.xquat[j])))
    return encode([w if p<0 else ws[p].inverted()@w for w,p in zip(ws,t["parents"])])

def correction_jacobian(cfg,q0):
    # Derivative of source-relative log coordinates with respect to the actual
    # MuJoCo tangent increment. Ball-joint corrections do not add linearly.
    model=cfg.model;n=model.nv;J=np.zeros((n,n));eps=1e-6
    for k in range(n):
        v=np.zeros(n);v[k]=1.
        a=cfg.q.copy();b=cfg.q.copy()
        mujoco.mj_integratePos(model,a,v,eps)
        mujoco.mj_integratePos(model,b,v,-eps)
        J[:,k]=(tangent(model,q0,a)-tangent(model,q0,b))/(2*eps)
    assert np.isfinite(J).all()
    return J

def solve_sparse_qp(P,q,A,upper,stats):
    # Same objective and inequalities for both numerical backends.
    def valid(x):
        return x is not None and np.isfinite(x).all() and np.max(A@x-upper)<=1e-5
    solver=osqp.OSQP()
    solver.setup(P=sparse.triu(P,format="csc"),q=q,A=A,l=np.full(len(upper),-np.inf),u=upper,
                 verbose=False,eps_abs=1e-6,eps_rel=1e-6,max_iter=20000,polishing=True)
    result=solver.solve()
    stats["solver_status"].append("OSQP: "+str(result.info.status))
    if result.info.status_val in (1,2) and valid(result.x):
        stats["osqp_accepted"]+=1
        return result.x
    # Independent sparse interior-point backend for difficult contact active sets.
    settings=clarabel.DefaultSettings();settings.verbose=False;settings.max_iter=150
    settings.tol_feas=1e-8;settings.tol_gap_abs=1e-8;settings.tol_gap_rel=1e-8
    fallback=clarabel.DefaultSolver(sparse.triu(P,format="csc"),q,A,upper,
                                  [clarabel.NonnegativeConeT(len(upper))],settings).solve()
    stats["solver_status"].append("Clarabel: "+str(fallback.status))
    x=np.asarray(fallback.x) if fallback.x is not None else None
    if str(fallback.status) in ("Solved","AlmostSolved") and valid(x):
        stats["clarabel_accepted"]+=1
        return x
    return None

def trajectory(t,bases,goals,skin,floor,seat_info,dt):
    """Offline simultaneous sequential QP across all source frames.
    Constraints include two-sided correction rates, not post-filtered motion."""
    ctx=[qp(t,b,g,(skin,floor,seat_info),context_only=True) for b,g in zip(bases,goals)]
    N=len(ctx);n=ctx[0][0].model.nv
    layout=lambda m:[(m.joint(j).name,int(m.jnt_type[j]),int(m.jnt_dofadr[j])) for j in range(m.njnt)]
    signature=layout(ctx[0][0].model)
    assert all(layout(cfg.model)==signature for cfg,_,_,_ in ctx)
    step,total=trust_bounds(ctx[0][0].model)
    rate=np.full(n,1.5)
    for j in range(ctx[0][0].model.njnt):
        if ctx[0][0].model.jnt_type[j]==mujoco.mjtJoint.mjJNT_FREE:
            a=int(ctx[0][0].model.jnt_dofadr[j]);rate[a:a+3]=.25
    rate*=dt
    D1=sparse.kron(sparse.diags([-np.ones(N-1),np.ones(N-1)],[0,1],shape=(N-1,N)),sparse.eye(n),format="csc")
    D2=sparse.kron(sparse.diags([np.ones(N-2),-2*np.ones(N-2),np.ones(N-2)],[0,1,2],shape=(N-2,N)),sparse.eye(n),format="csc")
    W=(.12*(D1.T@D1)+.4*(D2.T@D2)).tocsc()
    stats={"accepted_steps":0,"rejected_steps":0,"solver_status":[],"max_slack_m":0.,"osqp_accepted":0,"clarabel_accepted":0,"termination":"iteration_budget"}
    for iteration in range(24):
        current=np.concatenate([tangent(cfg.model,q0,cfg.q) for cfg,_,_,q0 in ctx])
        blocks=[];lin=[];constraints=[];bounds=[];sizes=[];jacobians=[]
        for cfg,tasks,limit,q0 in ctx:
            problem=mink.build_ik(cfg,tasks,.05,damping=.001,limits=[mink.ConfigurationLimit(cfg.model)])
            col=limit.compute_qp_inequalities(cfg,.05)
            m=0 if col.inactive else len(col.h)
            P=sparse.block_diag((sparse.csc_matrix(problem.P),sparse.eye(m)*200.),format="csc")
            blocks.append(P);lin.append(np.r_[problem.q,np.full(m,2.)]);sizes.append(n+m)
            G=[];h=[]
            if problem.G is not None:
                G.append(np.c_[problem.G,np.zeros((len(problem.h),m))]);h.append(problem.h)
            if m:
                G.append(np.c_[col.G,-np.eye(m)]);h.append(col.h)
                G.append(np.c_[np.zeros((m,n)),-np.eye(m)]);h.append(np.zeros(m))
            d=tangent(cfg.model,q0,cfg.q)
            J=correction_jacobian(cfg,q0);jacobians.append(sparse.csc_matrix(J))
            G.extend([np.c_[np.eye(n),np.zeros((n,m))],np.c_[-np.eye(n),np.zeros((n,m))],
                      np.c_[J,np.zeros((n,m))],np.c_[-J,np.zeros((n,m))]])
            h.extend([step,step,total-d,total+d]);constraints.append(sparse.csc_matrix(np.vstack(G)));bounds.append(np.concatenate(h))
        offsets=np.r_[0,np.cumsum(sizes)]
        cols=np.concatenate([np.arange(offsets[k],offsets[k]+n) for k in range(N)])
        E=sparse.csc_matrix((np.ones(N*n),(np.arange(N*n),cols)),shape=(N*n,int(offsets[-1])))
        B=sparse.block_diag(jacobians,format="csc")@E
        P=sparse.block_diag(blocks,format="csc")+B.T@W@B
        q=np.concatenate(lin)+np.asarray(B.T@(W@current)).ravel()
        A=sparse.vstack([sparse.block_diag(constraints,format="csc"),D1@B,-D1@B],format="csc")
        diff=D1@current;rb=np.tile(rate,N-1)
        upper=np.r_[np.concatenate(bounds),rb-diff,rb+diff]
        sol=solve_sparse_qp(P,q,A,upper,stats)
        if sol is None:
            stats["rejected_steps"]+=1;stats["termination"]="qp_failure";break
        dq=(E@sol).reshape(N,n)
        slack=np.delete(sol,cols);stats["max_slack_m"]=max(stats["max_slack_m"],float(max(0.,slack.max())) if len(slack) else 0.)
        accepted=False
        for a in (1.,.5,.25,.125,.0625,.03125):
            trials=[];deltas=[]
            for k,(cfg,_,_,q0) in enumerate(ctx):
                trial=cfg.q.copy();mujoco.mj_integratePos(cfg.model,trial,dq[k],a)
                trials.append(trial);deltas.append(tangent(cfg.model,q0,trial))
            d=np.asarray(deltas)
            if np.isfinite(d).all() and np.all(np.abs(d)<=total+1e-6) and np.all(np.abs(np.diff(d,axis=0))<=rate+1e-6):
                for (cfg,_,_,_),trial in zip(ctx,trials):cfg.update(trial)
                stats["accepted_steps"]+=1;accepted=True;break
        if not accepted:
            stats["rejected_steps"]+=1;stats["termination"]="integration_rejected";break
        if np.max(np.abs(a*dq))<1e-6:
            stats["termination"]="small_step";break
    stats["executed"]=stats["accepted_steps"]>0
    final=np.asarray([tangent(cfg.model,q0,cfg.q) for cfg,_,_,q0 in ctx])
    assert np.all(np.abs(final)<=total+1e-6) and np.all(np.abs(np.diff(final,axis=0))<=rate+1e-6)
    stats["max_rate_ratio"]=float(np.max(np.abs(np.diff(final,axis=0))/rate))
    stats["max_trust_ratio"]=float(np.max(np.abs(final)/total))
    poses=[]
    for cfg,_,_,_ in ctx:
        ws=[]
        for i in range(len(t["names"])):
            j=cfg.model.body(f"b{i}").id
            ws.append(transform(Vector(cfg.data.xpos[j]),Quaternion(cfg.data.xquat[j])))
        poses.append(encode([w if p<0 else ws[p].inverted()@w for w,p in zip(ws,t["parents"])]))
    return poses,stats

def apply(arm,bones,rest,f):
    # Convert desired world poses with Blender's own bone-local convention,
    # including local-location/inherit-scale flags and actual armature transform.
    # Restore the uniform rest scale stripped by the rigid solver contract.
    to_arm=(Y@arm.matrix_world).inverted()
    poses=[]
    for b,v in zip(bones,f):
        m=matrix(v["p"],v["r"])
        if b.parent is not None:m=poses[bones.index(b.parent)]@m
        poses.append(m)
    targets=[]
    for b,m in zip(bones,poses):
        rigid_rest=Y@arm.matrix_world@b.bone.matrix_local
        scale=rigid_rest.to_scale()
        assert max(scale)-min(scale)<.001*max(scale)
        desired=to_arm@m@Matrix.Diagonal((*scale,1.))
        if b.parent is None:
            basis=b.bone.convert_local_to_pose(desired,b.bone.matrix_local,invert=True)
        else:
            idx=bones.index(b.parent)
            basis=b.bone.convert_local_to_pose(desired,b.bone.matrix_local,
                parent_matrix=targets[idx],parent_matrix_local=b.parent.bone.matrix_local,invert=True)
        b.matrix_basis=basis
        targets.append(desired)
    bpy.context.view_layer.update()
    actual=locals_(arm,bones)
    err=max((m.to_translation()-Vector(v["p"])).length for m,v in zip(actual,f))
    rot=max(2*math.acos(min(1.,abs(m.to_quaternion().dot(matrix(v["p"],v["r"]).to_quaternion())))) for m,v in zip(actual,f))
    assert err<.0002 and rot<.002,("pose replay",err,rot)
def pose_error(t,f,goals):
    w=world(t,f)
    return {t["names"][i]:{"position_m":(w[i].translation-g.translation).length,
        "orientation_rad":2*math.acos(min(1.,abs(w[i].to_quaternion().dot(g.to_quaternion()))))}
        for i,g in goals.items()}
def metrics(t,f,goals,arm,bones,rest,regs,meshes,seat_info,floor,bf):
    apply(arm,bones,rest,f);actual=encode(locals_(arm,bones))
    w=world(t,actual);base=world(t,bf)
    # Measure actual evaluated skin and pose; not a collision-free certification.
    errors=pose_error(t,actual,goals)
    return {"targets":errors,"floor_min_m":min(sole(regs[s])-floor for s in regs),
        "seat_slab_vertices":seat_overlap(meshes,seat_info) if seat_info else None,
        "max_local_rotation_delta_rad":max(2*math.acos(min(1.,abs(matrix(a["p"],a["r"]).to_quaternion().dot(matrix(b["p"],b["r"]).to_quaternion())))) for a,b in zip(actual,bf)),
        "max_segment_change_m":max(abs((pos(w,i)-pos(w,p)).length-(pos(base,i)-pos(base,p)).length) for i,p in enumerate(t["parents"]) if p>=0 and i!=t["roles"]["hip"])}
def main():
    data=read("input.json");solved=read("solved.json");inv=read("semantic-inventory.json")
    for k,s in data["sources"].items():s["roles"]=inv["sources"][k]["map"]
    for k,t in data["targets"].items():t["roles"]=inv["targets"][k]["map"]
    old=list(pathlib.Path("prior-contacts").rglob("report.json"));assert len(old)==1
    prior=json.loads(old[0].read_text());assert len(prior["profiles"])==6
    report={"scope":"R11 full-clip sparse SQP with source-log Jacobian and independent solver fallback; same central sit cases and unchanged motion constraints","production":"BLOCKED","ART":"OPEN","profiles":{}}
    for key,t in data["targets"].items():
        central=key==min((k for k,v in data["targets"].items() if v["sex"]==t["sex"]),key=lambda k:abs(data["targets"][k]["scale"]-1))
        if not central:continue
        path=pathlib.Path("prior-full")/(key+".glb");assert digest(path)==t["sha256"]
        arm,bones=import_rig(path);reset(arm,bones);rest=locals_(arm,bones,True)
        meshes=[o for o in bpy.context.scene.objects if o.type=="MESH" and any(m.type=="ARMATURE" and m.object==arm for m in o.modifiers)]
        h,floor=setup(meshes);regs={s:regions(meshes,t,s) for s in ("l","r")}
        skin=WeightedSkin(t,meshes,arm,bones)
        apply(arm,bones,rest,t["rest"])
        bind_error=skin.actual_error(t["rest"])
        print("Neutral skin replay",key,bind_error,flush=True)
        assert bind_error["max_m"]<.002,("neutral skin replay",key,bind_error)
        pelvis=regions(meshes,t);ears=ear_candidates(meshes,t);hip=t["roles"]["hip"]
        report["profiles"][key]={}
        central=key==min((k for k,v in data["targets"].items() if v["sex"]==t["sex"]),key=lambda k:abs(data["targets"][k]["scale"]-1))
        for sk,s in data["sources"].items():
            for name,c in s["clips"].items():
                if name not in ("Sitting_Enter","Sitting_Exit"):continue
                frames=clone(solved[key][name]["variants"]["upf_common"])
                dt=c["duration"]/(len(frames)-1);sw=[world(s,f) for f in c["frames"]]
                windows={};weights={}
                for side in regs:
                    windows[side],weights[side]=contact_windows([list(pos(w,s["roles"]["foot_"+side])) for w in sw],dt,.035)
                if name=="Walk_Loop":
                    travel=stance_travel(t,frames,windows,dt)
                    for i,f in enumerate(frames):move_root(t,f,hip,travel*(i*dt))
                tw=[world(t,f) for f in frames]
                anchors={side:{i:pos(tw[a],t["roles"]["foot_"+side]) for a,b in windows[side] for i in range(a,b+1)} for side in regs}
                seat=None;seat_info=None;seatw=np.zeros(len(frames));phone=None;pside=None
                if "Sitting_" in name:
                    ys=np.array([pos(w,s["roles"]["hip"]).y for w in sw]);drop=float(max(ys)-min(ys))
                    assert drop>.08
                    seatw=np.array([smooth((max(ys)-y)/drop) for y in ys])
                    idx=int(np.argmin(ys));center=pos(tw[idx],hip);x,front=seat_axes(t,tw[idx])
                    center=center-front*(.38*.35);center.y=floor+.40
                    seat=oriented_seat(center,x,front,.52,.38);seat_info=(center,x,front,.52,.38,floor+.45)
                if "Phone" in name:
                    pside=min(regs,key=lambda side:np.median([(pos(w,s["roles"]["hand_"+side])-pos(w,s["roles"]["head"])).length for w in sw]))
                    phone=proxy("phone-proxy",(0,0,0),(.075,.145,.012),(.12,.12,.15))
                pairs,_=finger_map(s,t);rows=[];variants={k:[] for k in ("baseline","mink","mink_weighted","mink_temporal")};props=[];prev_diag=None;prev_base=None;all_goals=[]
                # All sampled source frames; same target definitions for both solvers.
                for i,bf0 in enumerate(frames):
                    bf=clone(bf0);fingers(s,t,c["frames"][i],bf,pairs);apply(arm,bones,rest,bf)
                    w=world(t,bf);goals={}
                    for side in regs:
                        e=t["roles"]["foot_"+side];low=sole(regs[side])
                        weight=float(weights[side][i])
                        if weight>0 or low<floor:
                            target=anchors[side].get(i,pos(w,e)).copy();target.y=w[e].translation.y+floor-low
                            p=pos(w,e).lerp(target,weight if weight>0 else 1.)
                            goals[e]=transform(p,w[e].to_quaternion())
                    if seat and seatw[i]>.01:
                        shift=(floor+.45-min(p.y for p in surface(pelvis)))*float(seatw[i])
                        goals[hip]=transform(pos(w,hip)+Vector((0,shift,0)),w[hip].to_quaternion())
                    phone_matrix=None
                    if phone:
                        head=w[t["roles"]["head"]];ear=head@ears[pside]
                        lateral=unit(ear-head.translation);e=t["roles"]["hand_"+pside]
                        palmq,pc=palm(t,w,pside,False)
                        normal=palmq@Vector((0,0,1))
                        # Choose the inward-facing palm sign closest to source; explicit orientation proxy.
                        inward=-lateral if normal.dot(-lateral)>=0 else lateral
                        dq=normal.rotation_difference(inward)
                        target=ear+lateral*.025-dq@(pc-pos(w,e))
                        goals[e]=transform(target,dq@w[e].to_quaternion())
                        phone_matrix=transform(ear+lateral*.012,dq@palmq)
                    all_goals.append(goals)
                    row={"frame":i,"goal_count":len(goals),"variants":{}}
                    diag={};temporal_diag={}
                    for label,fn in (("baseline",lambda:bf),("mink",lambda:qp(t,bf,goals)),("mink_weighted",lambda:qp(t,bf,goals,(skin,floor,seat_info),diag)),("mink_temporal",lambda:qp(t,bf,goals,(skin,floor,seat_info),temporal_diag,prev_diag,dt))):
                        start=time.perf_counter()
                        failure=None
                        try:
                            f=fn() if goals or label in ("mink_weighted","mink_temporal") else bf
                        except mink.NoSolutionFound as exc:
                            if label not in ("mink_weighted","mink_temporal"):raise
                            failure=str(exc);f=bf
                        assert all(math.isfinite(z) for b in f for z in b["p"]+b["r"])
                        row["variants"][label]=metrics(t,f,goals,arm,bones,rest,regs,meshes,seat_info,floor,bf)
                        row["variants"][label]["elapsed_s"]=time.perf_counter()-start
                        row["variants"][label]["infeasible"]=failure is not None
                        replay=skin.actual_error(f)
                        row["variants"][label]["skin_replay"]=replay
                        if replay["max_m"]>=.002:
                            (OUT/"skin-replay-failure.json").write_text(json.dumps({"profile":key,"clip":name,"frame":i,"variant":label,"replay":replay,"bind_error":bind_error},indent=2))
                        assert replay["max_m"]<.002,("LBS replay mismatch",key,name,i,label,replay)
                        if label in ("mink_weighted","mink_temporal"):
                            active_diag=temporal_diag if label=="mink_temporal" else diag
                            row["variants"][label]["surface_constraint"]=active_diag.copy()
                            row["variants"][label]["failure"]=failure
                            ww=world(t,f);bw=world(t,bf)
                            shift=max((ww[j].translation-bw[j].translation).length for j,p in enumerate(t["parents"]) if p<0)
                            row["variants"][label]["root_shift_m"]=shift
                            assert shift<=.18,("root displacement",key,name,i,shift)
                            if i:
                                prev=variants[label][-1];bp=prev_base
                                corrections=[]
                                for v,u,pv,pu in zip(f,bf,prev,bp):
                                    q1=matrix(u["p"],u["r"]).to_quaternion().inverted()@matrix(v["p"],v["r"]).to_quaternion()
                                    q0=matrix(pu["p"],pu["r"]).to_quaternion().inverted()@matrix(pv["p"],pv["r"]).to_quaternion()
                                    corrections.append(2*math.acos(min(1.,abs(q0.dot(q1)))))
                                row["variants"][label]["correction_frame_jump_rad"]=max(corrections)
                        variants[label].append(f)
                    prev_base=clone(bf);prev_diag=temporal_diag.copy() if "final_tangent" in temporal_diag else None
                    props.append(phone_matrix);rows.append(row)
                bases=variants["baseline"]
                fs,trajectory_stats=trajectory(t,bases,all_goals,skin,floor,seat_info,dt)
                variants["mink_trajectory"]=fs
                for i,(f,bf,goals) in enumerate(zip(fs,bases,all_goals)):
                    result=metrics(t,f,goals,arm,bones,rest,regs,meshes,seat_info,floor,bf)
                    result["skin_replay"]=skin.actual_error(f)
                    assert result["skin_replay"]["max_m"]<.002
                    ww=world(t,f);bw=world(t,bf)
                    shift=max((ww[j].translation-bw[j].translation).length for j,p in enumerate(t["parents"]) if p<0)
                    result["root_shift_m"]=shift;assert shift<=.18
                    result["infeasible"]=not trajectory_stats["executed"]
                    if i:
                        corrections=[]
                        for v,u,pv,pu in zip(f,bf,fs[i-1],bases[i-1]):
                            q1=matrix(u["p"],u["r"]).to_quaternion().inverted()@matrix(v["p"],v["r"]).to_quaternion()
                            q0=matrix(pu["p"],pu["r"]).to_quaternion().inverted()@matrix(pv["p"],pv["r"]).to_quaternion()
                            corrections.append(2*math.acos(min(1.,abs(q0.dot(q1)))))
                        result["correction_frame_jump_rad"]=max(corrections)
                    rows[i]["variants"]["mink_trajectory"]=result
                report["profiles"][key][name]={"trajectory_stats":trajectory_stats,"samples":rows,"prior_r2_summary":prior["profiles"][key][name]["summary"],"comparison_note":"R2 historical targets differ; not a matched R2 solve."}
                (OUT/"report.json").write_text(json.dumps(report,indent=2))
                if central:
                    for label,fs in variants.items():
                        n=len(fs) if label in ("mink_weighted","mink_temporal","mink_trajectory") else min(12,len(fs));prefix=f"{key}-{name}-{label}"
                        with tempfile.TemporaryDirectory() as tmp:
                            for j in range(n):
                                idx=round((len(fs)-1)*j/(n-1));apply(arm,bones,rest,fs[idx])
                                if phone and props[idx] is not None:phone.matrix_world=Y.inverted()@props[idx]@Matrix.Diagonal((.075,.012,.145,1.))
                                scene=bpy.context.scene;scene.render.filepath=str(pathlib.Path(tmp)/f"{j:03d}.png")
                                bpy.ops.render.render(write_still=True)
                                if j in (0,n//2,n-1):shutil.copyfile(scene.render.filepath,OUT/(prefix+f"-{j:03d}.png"))
                            subprocess.run([get_ffmpeg_exe(),"-y","-loglevel","error","-framerate",str((n-1)/c["duration"]),"-i",tmp+"/%03d.png","-c:v","libx264","-pix_fmt","yuv420p",str(OUT/(prefix+".mp4"))],check=True)
                for o in (seat,phone):
                    if o:bpy.data.objects.remove(o,do_unlink=True)
    assert len(report["profiles"])==2 and all(len(x)==2 for x in report["profiles"].values())
    assert len(list(OUT.glob("*.mp4")))==20
    assert all(v["trajectory_stats"]["executed"] for p in report["profiles"].values() for v in p.values()),"trajectory failed to execute; see report and video evidence"
    print("R11 full-clip weighted skin diagnostic complete; ART and contact acceptance OPEN")
if __name__=="__main__":main()
