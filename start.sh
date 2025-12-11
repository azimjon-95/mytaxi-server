#!/bin/bash

# Loyihaga kirish
cd /mnt/c/Users/user/Desktop/mytaxi/server

# Redis container mavjudligini tekshirish
if [ "$(docker ps -q -f name=redis)" = "" ]; then
    if [ "$(docker ps -aq -f name=redis)" = "" ]; then
        echo "Redis container yo'q, yaratilyapti..."
        docker run -d --name redis -p 6379:6379 redis
    else
        echo "Redis container topildi, boshlanyapti..."
        docker start redis
    fi
else
    echo "Redis container allaqachon ishlayapti."
fi

# Node.js serverini ishga tushirish
npm start

# =================
# 1)  wsl -d Ubuntu
# 2)  cd server
# 3)  ./start.sh
# =================
# // Redis konsoliga kirish
# redis-cli 
# // barcha keylarni ko'rish
# keys *
# // redis barcha datalarni o'chirish — qayta tiklab bo‘lmaydi.
# FLUSHALL