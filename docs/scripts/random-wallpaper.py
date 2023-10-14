import os
import random
import subprocess
import time

dir_path = '/path/to/wallpaper/directory' # Set the path to your directory
video_exts = ['.mp4', '.webm']
interval = 30 # Set the interval in seconds

while True:
    video_paths = []
    for root, _, files in os.walk(dir_path):
        for file in files:
            if any(file.lower().endswith(ext) for ext in video_exts):
                video_paths.append(os.path.join(root, file))

    if video_paths:
        video_path = random.choice(video_paths)
        gsettings_command = f"gsettings set io.github.jeffshee.hanabi-extension video-path '{video_path}'"
        print(f"Video path: {video_path}")
        subprocess.run(["bash", "-c", gsettings_command])

    time.sleep(interval)