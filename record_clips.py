import math
from pathlib import Path
import sys
import cv2
import mujoco

root = Path(__file__).resolve().parent
sys.path.insert(0, str(root.parent / "reachy-studio"))
from hanoi_world import make_scene

model = mujoco.MjModel.from_xml_string(make_scene(0))
data = mujoco.MjData(model)
model.geom_contype[:] = 0
model.geom_conaffinity[:] = 0
print([model.actuator(i).name for i in range(model.nu)], flush=True)
renderer = mujoco.Renderer(model, height=360, width=480)
for name, speed, depth, side in [
    ("idle", 1, .017, .013), ("thinking", 1, .040, .060),
    ("hint", 2, .095, .035), ("retry", 1, .030, .075),
    ("success", 3, .120, .085), ("finish", 1, .060, .015),
]:
    target = root / "media" / (name + ".webm")
    writer = cv2.VideoWriter(str(target), cv2.VideoWriter_fourcc(*"VP80"), 24, (480, 360))
    if not writer.isOpened():
        raise RuntimeError("Cannot encode " + name)
    mujoco.mj_resetData(model, data)
    for frame in range(72):
        t = frame / 72
        envelope = math.sin(math.pi * t) ** 2
        wave = math.sin(2 * math.pi * speed * t) * envelope
        for i in range(model.nu):
            actuator = model.actuator(i).name.lower()
            if "antenna" in actuator:
                data.ctrl[i] = side * wave * (1 if "left" in actuator else -1)
            elif "yaw" in actuator:
                data.ctrl[i] = side * wave
            else:
                data.ctrl[i] = depth * wave * math.cos(i * math.pi / 3)
        for _ in range(max(1, round(1 / 24 / model.opt.timestep))):
            mujoco.mj_step(model, data)
        renderer.update_scene(data, camera="lab_overview")
        pixels = cv2.cvtColor(renderer.render(), cv2.COLOR_RGB2BGR)
        writer.write(pixels)
        if name == "idle" and frame == 0:
            cv2.imwrite(str(root / "media" / "reachy.jpg"), pixels)
    writer.release()
    print(target.name, target.stat().st_size, flush=True)
renderer.close()
