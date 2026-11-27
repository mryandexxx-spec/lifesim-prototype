"""Fixed source-proxy + target weighted-surface phase hypotheses. No fitted keys."""
import numpy as np
def phase_hypotheses(F,B,arm,bones,rest,t,skin,meshes,regs,bases,roles,names,floor,dt,loop,stride):
    B.apply_checked(arm,bones,rest,t["rest"])
    neutral=np.array([list(v) for v in F.surface(skin.reg)])
    wr=F.world(t,t["rest"])
    offsets={};offset=0
    for o in meshes:offsets[o.name]=offset;offset+=len(o.data.vertices)
    assert offset==len(neutral)
    patches={}
    for s,side,suffix in (("l","left","L"),("r","right","R")):
        ids=np.array([offsets[o.name]+j for o,ix in regs[s] for j in ix])
        origin=np.array(wr[roles["foot_"+s]].translation)
        axis=np.array(wr[names.index("toe1-1."+suffix)].translation)-origin;axis[1]=0
        assert np.linalg.norm(axis)>.01;axis/=np.linalg.norm(axis)
        along=(neutral[ids]-origin)@axis
        for part,q in (("heel",.4),("forefoot",.6)):
            key=side+"_"+part
            sub=ids[along<=np.quantile(along,q)] if part=="heel" else ids[along>=np.quantile(along,q)]
            sub=sub[neutral[sub,1]<=np.quantile(neutral[sub,1],.25)+.005]
            assert len(sub)>=3
            center=neutral[sub].mean(axis=0)
            sub=sub[np.argsort(np.linalg.norm(neutral[sub]-center,axis=1),kind="stable")[:3]]
            patches[key]=sub
    values={k:[] for k in patches};floors=[]
    for f in bases:
        B.apply_checked(arm,bones,rest,f)
        pts=np.array([list(v) for v in F.surface(skin.reg)])
        assert np.isfinite(pts).all()
        floors.append(float(pts[:,1].min()-floor))
        for k,sub in patches.items():values[k].append(pts[sub].mean(axis=0))
    flags=np.array([r["lowSlow"] for r in loop["contactProxies"]["perFrame"]],dtype=bool)
    assert flags.shape==(len(bases),4)
    output={"status":"PENDING","failures":[],"frames":len(bases),"sourceProxy":"left ankle/toe, right ankle/toe; skeletal only, not pressure/contact truth","thresholds":{"absolutePatchHeightResidualM":.03,"patchSpeedMps":.15,"minimumConsecutiveSteps":2},"samples":{},"patches":{},"phasePlan":{},"wholeSkinFloorMinM":floors}
    for j,k in enumerate(("left_heel","left_forefoot","right_heel","right_forefoot")):
        sub=patches[k];p=np.asarray(values[k])
        nominal=floor+max(0.,float(neutral[sub,1].mean()-neutral[:,1].min()))
        gap=p[:,1]-nominal;vel=np.zeros(len(p));vel[1:]=np.linalg.norm(np.diff(p,axis=0),axis=-1)/dt
        vel[0]=np.linalg.norm(p[0]+stride-p[-2])/dt
        close=np.abs(gap)<=.03
        rows=[]
        for i in range(len(p)):
            prev=i-1 if i else len(p)-2
            # A selected edge requires both ends supported by independent low/slow joint
            # proxy and by target geometry, and small actual target patch displacement.
            yes=bool(i>0 and flags[i,j] and flags[prev,j] and close[i] and close[prev] and vel[i]<=.15)
            rows.append({"frame":i,"sourceLowSlow":bool(flags[i,j]),"heightResidualM":float(gap[i]),"patchSpeedMps":float(vel[i]),"stationaryCandidate":yes,"centroidM":p[i].tolist()})
        runs=[];a=None
        for i,yes in enumerate([*[q["stationaryCandidate"] for q in rows],False]):
            if yes and a is None:a=i
            if not yes and a is not None:
                if i-a>=2:runs.append([max(0,a-1),i-1])
                a=None
        if not runs:output["failures"].append("NO_CONFIRMED_PATCH_"+k.upper())
        output["samples"][k]=rows;output["patches"][k]=sub.tolist();output["phasePlan"][k]=runs
    output["status"]="PHASE_INPUT_PASS" if not output["failures"] else "PHASE_INPUT_HOLD"
    return output
