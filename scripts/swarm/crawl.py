import asyncio, json, os, sys
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path("/tmp/browser/swarm/shots"); OUT.mkdir(parents=True,exist_ok=True)
ROUTES=["/dashboard","/students","/admissions","/fees","/classes","/courses","/programs","/academics","/results","/board","/cambridge","/certificates","/timetable","/notices","/homework","/staff","/staff?tab=attendance","/campuses","/users","/import-export","/billing","/insights","/track-switch","/platform","/portal","/assistant"]
VIEW={"desktop":{"width":1280,"height":1800},"mobile":{"width":390,"height":844}}
async def run(vp):
  rep=[]
  async with async_playwright() as p:
    b=await p.chromium.launch(headless=True); c=await b.new_context(viewport=VIEW[vp]); pg=await c.new_page()
    errs=[]
    pg.on("console",lambda m: errs.append(("console",m.text[:200])) if m.type=="error" else None)
    pg.on("pageerror",lambda e: errs.append(("pageerror",str(e)[:200])))
    pg.on("response",lambda r: errs.append(("http",f"{r.status} {r.request.method} {r.url[:140]}")) if r.status>=400 else None)
    await pg.goto("http://localhost:8080")
    await pg.evaluate(f"localStorage.setItem({json.dumps(os.environ['LOVABLE_BROWSER_SUPABASE_STORAGE_KEY'])},{json.dumps(os.environ['LOVABLE_BROWSER_SUPABASE_SESSION_JSON'])})")
    for r in ROUTES:
      errs.clear()
      try:
        await pg.goto("http://localhost:8080"+r,wait_until="networkidle",timeout=30000)
      except Exception as e: errs.append(("nav",str(e)[:120]))
      await pg.wait_for_timeout(1200)
      body=(await pg.inner_text("body"))[:3000]
      flags=[k for k in ["Something went wrong","Error","NaN","undefined","Infinity","null","Failed","Forbidden","Not Found","404"] if k in body]
      tabs=await pg.get_by_role("tab").all()
      tabres=[]
      for t in tabs[:12]:
        try:
          n=(await t.inner_text()).strip(); await t.click(timeout=3000); await pg.wait_for_timeout(500)
          tb=(await pg.inner_text("main") if await pg.locator("main").count() else "")[:2000]
          tabres.append([n,[k for k in ["NaN","undefined","Infinity","Something went wrong"] if k in tb]])
        except Exception as e: tabres.append(["?",str(e)[:60]])
      ow=await pg.evaluate("document.documentElement.scrollWidth>window.innerWidth+2")
      name=r.strip("/").replace("/","_").replace("?","_").replace("=","_") or "root"
      await pg.screenshot(path=str(OUT/f"{vp}_{name}.png"))
      rep.append({"route":r,"url":pg.url,"flags":flags,"errors":list(dict.fromkeys([f"{a}: {b}" for a,b in errs]))[:8],"tabs":tabres,"overflow":ow})
    await b.close()
  return rep
async def main():
  res={vp:await run(vp) for vp in VIEW}
  Path("/tmp/browser/swarm/report.json").write_text(json.dumps(res,indent=1))
asyncio.run(main())
