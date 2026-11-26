import numpy as np
def phases(toe,dt,hip):
    toe=np.asarray(toe,dtype=float)
    if toe.ndim!=2 or toe.shape[1]!=3 or len(toe)<3 or not np.isfinite(toe).all() or not np.isfinite(dt) or dt<=0 or not np.isfinite(hip) or hip<=0:raise ValueError("invalid source")
    y=toe[:,2]/hip
    speed=np.abs(np.gradient(y,dt))
    mask=(y<=np.quantile(y,.10)+.035)&(speed<=.22)
    windows=[];start=None
    for i,yes in enumerate([*mask,False]):
        if yes and start is None:start=i
        if not yes and start is not None:
            if i-start>=3:windows.append([start,i-1])
            start=None
    labels=["free"]*len(y)
    for a,b in windows:
        if a>0 and labels[a-1]=="free":labels[a-1]="approach"
        if b+1<len(y):labels[b+1]="release"
        for k in range(a,b+1):labels[k]="plant"
    return {"version":1,"windows":windows,"phases":labels,"confidence":"heuristic-source-landmark","toeHeightNormalized":y.tolist(),"verticalSpeedNormalized":speed.tolist(),"horizontalSpeedNormalized":(np.linalg.norm(np.gradient(toe[:,:2],dt,axis=0),axis=1)/hip).tolist()}
def feasible_step(before,after):
    a=np.asarray(before);b=np.asarray(after)
    if a.shape!=b.shape or a.size==0 or not np.isfinite(a).all() or not np.isfinite(b).all() or (a<0).any() or (b<0).any():return False
    return bool(np.all(b<=a+1e-6) and b.sum()<=a.sum()+1e-6)
