#!/bin/bash
# /usr/local/bin/cups-watchdog.sh
PRINTER="Druckinator3000"
MAX_AGE=900   # Sekunden

now=$(date +%s)

# 1. Zu alte Jobs verwerfen (VOR dem Reaktivieren!)
lpstat -o "$PRINTER" 2>/dev/null | while read -r job user size rest; do
    jt=$(date -d "$rest" +%s 2>/dev/null) || continue
    if (( now - jt > MAX_AGE )); then
        cancel "$job" && logger -t cups-watchdog "Job $job verworfen (Alter $(( (now-jt)/60 )) min)"
    fi
done

# 2. Queue reaktivieren
if lpstat -p "$PRINTER" 2>/dev/null | grep -qi "disabled"; then
    /usr/sbin/cupsenable "$PRINTER"
    logger -t cups-watchdog "Queue $PRINTER reaktiviert"
fi