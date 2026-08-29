import json, os
R = "/Users/l.romanov/workspace/my/nuxt-songs-app"
plan = json.load(open(os.path.join(R, "notes-omr/pdf-epp/recognize-plan.json")))
t1 = {int(k): v for k, v in plan.items() if v["tier"] == 1 and v.get("text_files")}
nums = sorted(t1)
pick = sorted({nums[round(i * (len(nums) - 1) / 59)] for i in range(60)})
sel = {n: {"sheet": t1[n]["sheet"], "pdf": t1[n]["text_files"][0]} for n in pick}
json.dump(sel, open(os.path.join(R, "notes-omr/out-epp/sample60.json"), "w"), indent=1)
print(len(sel), "песен; выше 830:", sum(1 for n in sel if n > 830))
print("sheet != num:", [(n, sel[n]["sheet"]) for n in sel if sel[n]["sheet"] != n])
