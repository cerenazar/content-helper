#!/bin/sh
# Hazır ses efektlerini ffmpeg ile sıfırdan üretir (kayıt ya da örnek yok, lisans: CC0).
# Kullanım: sh apps/server/assets/sfx/generate.sh
set -e
cd "$(dirname "$0")"
gen() { ffmpeg -v error -y -f lavfi -i "aevalsrc=$2:s=48000:d=$3" $4 -ac 1 -ar 48000 -c:a pcm_s16le "$1.wav"; }
# pop: hızla düşen perde (900→300 Hz), kısa sönüm
gen pop '0.8*sin(2*PI*(300*t+15*(1-exp(-40*t))))*exp(-28*t)' 0.16
noise() { ffmpeg -v error -y -f lavfi -i "anoisesrc=d=$2:c=white:a=$3:r=48000:s=7" -af "$4" -ac 1 -ar 48000 -c:a pcm_s16le "$1.wav"; }
# click: çok kısa, tiz gürültü patlaması
noise click 0.04 0.45 'highpass=f=2500,afade=t=out:d=0.04:curve=exp'
# whoosh: yükselip alçalan bant geçiren gürültü
noise whoosh 0.5 1 'bandpass=f=1200:width_type=h:w=1600,afade=t=in:d=0.28:curve=qsin,afade=t=out:st=0.28:d=0.22:curve=qsin,volume=1.1'
# ding: zil, üç harmonik, uzun sönüm
gen ding '0.55*(sin(2*PI*1318*t)+0.35*sin(2*PI*2637*t)+0.12*sin(2*PI*3955*t))*exp(-4.5*t)*min(1\,t*400)' 1.0
# blip: iki kısa ton (arayüz onayı)
gen blip '0.5*sin(2*PI*if(lt(t\,0.06)\,988\,1480)*t)*if(lt(t\,0.06)\,1\,exp(-30*(t-0.06)))*min(1\,t*500)' 0.18
