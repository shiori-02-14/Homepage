#!/bin/zsh
cd ~/Desktop/Homepage || exit 1
git add .
git commit -m "auto: $(date '+%Y-%m-%d %H:%M:%S')" || exit 0
git push origin main
