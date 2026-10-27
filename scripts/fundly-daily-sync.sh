#!/bin/bash
# fundly daily update: local fetch -> verify -> publish snapshot to jp4 prod (Tailscale SSH).
# Usage: fundly-daily-sync.sh [--no-fetch] [--no-sync] [--weekly] [--skip-upload] [--lock-check]
#
# jp4: SSH nocoo@jp4 (MagicDNS), port 52722; prod sqlite /data/fundly/data/fundly.db only.
# Never upload or overwrite auth.db. Env: FUNDLY_JP4_SSH_KEY (default ~/.ssh/id_rsa),
# FUNDLY_JP4_HOST (default 100.101.0.6), FUNDLY_JP4_USER (nocoo), FUNDLY_JP4_PORT (52722).
set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.bun/bin"
REPO="$HOME/workspace/personal/fundly"
DB="$REPO/data/fundly.db"
LOGDIR="${FUNDLY_STATE_DIR:-$HOME/.local/state/fundly}"; mkdir -p "$LOGDIR"
DAY=$(date +%F); LOG="$LOGDIR/$DAY.log"; REPORT="$LOGDIR/report.json"
LAUNCHD_LOG="$LOGDIR/launchd.log"
LOCK="/tmp/fundly-daily-sync.lock"
JP4_HOST="${FUNDLY_JP4_HOST:-100.101.0.6}"  # Studio MagicDNS often fails for short name jp4
JP4_USER="${FUNDLY_JP4_USER:-nocoo}"
JP4_PORT="${FUNDLY_JP4_PORT:-52722}"
JP4_KEY="${FUNDLY_JP4_SSH_KEY:-$HOME/.ssh/id_rsa}"  # fleet ops RSA (not railway)
JP4_DATA="${FUNDLY_JP4_DATA_DIR:-/data/fundly/data}"
SNAP="$REPO/data/fundly.snap.db"
LIVE_URL="${FUNDLY_LIVE_URL:-https://fundly.hexly.ai/api/live}"
LIVE_COMPONENT="${FUNDLY_LIVE_COMPONENT:-jp4}"
# Stale success report threshold for morning-check visibility (hours)
STALE_HOURS_WARN=${FUNDLY_STALE_HOURS_WARN:-20}
RESTART_WAIT=${FUNDLY_RESTART_WAIT:-600}
SEL_ATTEMPTS=${FUNDLY_SEL_ATTEMPTS:-2}
SEL_BACKOFF=${FUNDLY_SEL_BACKOFF:-180}
DO_FETCH=1 DO_SYNC=1 WEEKLY=0 SKIP_UP=0 LOCK_CHECK=0
[ "$(date +%u)" = 7 ] && WEEKLY=1
for a in "$@"; do case $a in
  --no-fetch) DO_FETCH=0;;
  --no-sync) DO_SYNC=0;;
  --weekly) WEEKLY=1;;
  --skip-upload) SKIP_UP=1;;
  --lock-check) LOCK_CHECK=1;;
esac; done
STEPS=(); STATUS=ok; ERR=""; START=$(date +%s)
LOCK_STATUS=acquired; STALE_CLEARED=0; PREV_REPORT_AGE_HOURS=""
PROD=null
log(){ echo "[$(date '+%F %T')] $*" | tee -a "$LOG"; }
launchd_note(){ echo "[$(date '+%F %T %z')] $*" >>"$LAUNCHD_LOG"; }

ssh_jp4(){ ssh -i "$JP4_KEY" -p "$JP4_PORT" -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=30 "${JP4_USER}@${JP4_HOST}" "$@"; }
scp_jp4(){ scp -i "$JP4_KEY" -P "$JP4_PORT" -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=60 "$@"; }

tree_pids(){ local c; echo "$1"; for c in $(pgrep -P "$1" 2>/dev/null); do tree_pids "$c"; done; }
kill_tree(){ local pids; pids=$(tree_pids "$1"); kill -TERM $pids 2>/dev/null; sleep 5; kill -KILL $pids 2>/dev/null; wait "$1" 2>/dev/null; }
# run_to SECS cmd... : run with a hard timeout (0 = none); rc 124 on timeout
run_to(){ local secs=$1; shift
  if [ "${secs:-0}" -le 0 ]; then "$@"; return $?; fi
  "$@" 0<&0 &
  local pid=$! deadline=$(( $(date +%s)+secs ))
  while kill -0 "$pid" 2>/dev/null; do
    if [ "$(date +%s)" -ge "$deadline" ]; then
      echo "[$(date '+%F %T')] !! timeout ${secs}s, killing: $*" >&2
      kill_tree "$pid"; return 124
    fi
    sleep 1
  done
  wait "$pid"
}

# Compute expected last trading day (Asia/Shanghai wall clock via local date)
expected_nav(){
  local expect; expect=$(date -v-1d +%F)
  case $(date +%u) in
    1) expect=$(date -v-3d +%F);;  # Mon -> Fri
    7) expect=$(date -v-2d +%F);;  # Sun -> Fri
  esac
  # After 21:00 on a weekday, same-day NAV may already be available
  if [ "$(date +%H)" -ge 21 ] && [ "$(date +%u)" -le 5 ]; then expect=$DAY; fi
  echo "$expect"
}

# Write a timestamped failure/lock report without touching a live lock.
write_fail_report(){
  local reason=$1 detail=${2:-}
  local ts stamp fail_path nav rows mk age_h
  ts=$(date '+%F %T %z')
  stamp=$(date '+%Y%m%d-%H%M%S')
  fail_path="$LOGDIR/report-${DAY}-fail-${stamp}.json"
  nav=$(sqlite3 -readonly "$DB" "select max(nav_date) from fund_nav" 2>/dev/null || echo "")
  rows=$(sqlite3 -readonly "$DB" "select count(*) from fund_nav" 2>/dev/null || echo 0)
  mk=$(sqlite3 -readonly "$DB" "select count(*) from sqlite_master where name like 'market_%' or name like 'selection_%'" 2>/dev/null || echo 0)
  age_h=""
  if [ -f "$REPORT" ]; then
    local fin epoch_now epoch_fin
    fin=$(python3 -c "import json;print(json.load(open('$REPORT')).get('finished',''))" 2>/dev/null || true)
    if [ -n "$fin" ]; then
      epoch_fin=$(date -j -f '%Y-%m-%d %H:%M:%S %z' "$fin" +%s 2>/dev/null || true)
      epoch_now=$(date +%s)
      if [ -n "${epoch_fin:-}" ]; then age_h=$(echo "scale=1; ($epoch_now - $epoch_fin) / 3600" | bc 2>/dev/null || echo ""); fi
    fi
  fi
  local expect; expect=$(expected_nav)
  local nav_behind=0
  [ -n "$nav" ] && [[ "$nav" < "$expect" ]] && nav_behind=1
  printf '{"date":"%s","finished":"%s","status":"fail","errors":"%s","detail":"%s","elapsed_sec":%s,"weekly":%s,"max_nav_date":"%s","fund_nav_rows":%s,"market_selection_tables":%s,"prod":null,"steps":[],"log":"%s","lock_status":"%s","stale_hours":%s,"expected_nav_date":"%s","nav_behind_expected":%s,"prev_report_age_hours":%s}\n' \
    "$DAY" "$ts" "$reason" "$detail" $(( $(date +%s)-START )) $WEEKLY "${nav:-}" "${rows:-0}" "${mk:-0}" "$LOG" \
    "$LOCK_STATUS" \
    "${age_h:-null}" \
    "$expect" \
    "$nav_behind" \
    "${age_h:-null}" \
    > "$fail_path"
  # Also refresh report.json so morning check sees the failure (not a stale ok)
  cp "$fail_path" "$REPORT"
  launchd_note "FAIL reason=$reason detail=$detail report=$fail_path"
  log "FAIL reason=$reason detail=$detail report=$fail_path"
}

pid_alive(){
  local pid=$1
  [ -n "$pid" ] && [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null
}

acquire_lock(){
  local tries=0 pid pidfile reason
  while [ $tries -lt 2 ]; do
    if mkdir "$LOCK" 2>/dev/null; then
      echo $$ > "$LOCK/pid"
      echo "$(date '+%F %T %z')" > "$LOCK/started"
      LOCK_STATUS=acquired
      return 0
    fi
    pidfile="$LOCK/pid"
    pid=""
    [ -f "$pidfile" ] && pid=$(cat "$pidfile" 2>/dev/null | tr -d '[:space:]')
    if pid_alive "$pid"; then
      LOCK_STATUS=held_by_live_pid
      reason="lock_held"
      write_fail_report "$reason" "pid=$pid lock=$LOCK"
      return 3
    fi
    # Stale or empty lock: clear and retry once
    LOCK_STATUS=stale_cleared
    STALE_CLEARED=1
    launchd_note "STALE_LOCK cleared old_pid=${pid:-none} lock=$LOCK"
    log "stale lock cleared old_pid=${pid:-none}"
    rm -rf "$LOCK"
    tries=$((tries+1))
  done
  LOCK_STATUS=acquire_failed
  write_fail_report "lock_acquire_failed" "lock=$LOCK"
  return 3
}

release_lock(){
  # Only remove if we own it (our pid file)
  if [ -f "$LOCK/pid" ]; then
    local owner; owner=$(cat "$LOCK/pid" 2>/dev/null | tr -d '[:space:]')
    if [ "$owner" = "$$" ]; then rm -rf "$LOCK"; fi
  fi
}

check_prev_report_stale(){
  PREV_REPORT_AGE_HOURS=""
  [ -f "$REPORT" ] || return 0
  local fin epoch_fin epoch_now age_h status_prev
  fin=$(python3 -c "import json;d=json.load(open('$REPORT'));print(d.get('finished',''))" 2>/dev/null || true)
  status_prev=$(python3 -c "import json;d=json.load(open('$REPORT'));print(d.get('status',''))" 2>/dev/null || true)
  [ -z "$fin" ] && return 0
  epoch_fin=$(date -j -f '%Y-%m-%d %H:%M:%S %z' "$fin" +%s 2>/dev/null || true)
  epoch_now=$(date +%s)
  [ -z "${epoch_fin:-}" ] && return 0
  age_h=$(echo "scale=1; ($epoch_now - $epoch_fin) / 3600" | bc 2>/dev/null || echo "0")
  PREV_REPORT_AGE_HOURS=$age_h
  if echo "$age_h > $STALE_HOURS_WARN" | bc -l 2>/dev/null | grep -q '^1$'; then
    log "WARN prev report stale age_hours=$age_h status=$status_prev finished=$fin (threshold=${STALE_HOURS_WARN}h)"
    launchd_note "STALE_REPORT age_hours=$age_h status=$status_prev finished=$fin"
  fi
}

# step NAME FATAL TIMEOUT_SEC cmd...
step(){ local name=$1 fatal=$2 tmo=$3; shift 3; local t=$(date +%s); log "== $name (timeout=${tmo}s)"; run_to "$tmo" "$@" >>"$LOG" 2>&1; local rc=$?
  STEPS+=("{\"step\":\"$name\",\"rc\":$rc,\"sec\":$(( $(date +%s)-t ))}")
  if [ $rc -ne 0 ]; then log "!! $name failed rc=$rc$([ $rc = 124 ] && echo ' (timeout)')"; [ "$STATUS" = ok ] && STATUS=warn; ERR="$ERR $name"; [ "$fatal" = 1 ] && { STATUS=fail; finish; }; fi; return $rc; }
q(){ sqlite3 -readonly "$DB" "$1"; }

# Bounded retry for transient upstream errors (e.g. Fuyao 5003); stays non-fatal.
fetch_selection_retry(){ local i rc=1
  for i in $(seq 1 "$SEL_ATTEMPTS"); do
    echo "-- fetch_selection attempt $i/$SEL_ATTEMPTS $(date '+%F %T')"
    run_to 1800 bun run fetch:selection; rc=$?
    [ $rc = 0 ] && return 0
    [ "$i" -lt "$SEL_ATTEMPTS" ] && { echo "-- attempt $i rc=$rc, retry in ${SEL_BACKOFF}s"; sleep "$SEL_BACKOFF"; }
  done
  return $rc
}

finish(){
  local nav rows mk expect nav_behind=0
  nav=$(q "select max(nav_date) from fund_nav" 2>/dev/null)
  rows=$(q "select count(*) from fund_nav" 2>/dev/null)
  mk=$(q "select count(*) from sqlite_master where name like 'market_%' or name like 'selection_%'" 2>/dev/null)
  expect=$(expected_nav)
  [ -n "$nav" ] && [[ "$nav" < "$expect" ]] && nav_behind=1
  local age_field="null"
  [ -n "$PREV_REPORT_AGE_HOURS" ] && age_field="$PREV_REPORT_AGE_HOURS"
  printf '{"date":"%s","finished":"%s","status":"%s","errors":"%s","elapsed_sec":%s,"weekly":%s,"max_nav_date":"%s","fund_nav_rows":%s,"market_selection_tables":%s,"prod":%s,"steps":[%s],"log":"%s","lock_status":"%s","stale_cleared":%s,"prev_report_age_hours":%s,"expected_nav_date":"%s","nav_behind_expected":%s,"sync":%s,"jp4_host":"%s"}\n' \
    "$DAY" "$(date '+%F %T %z')" "$STATUS" "${ERR# }" $(( $(date +%s)-START )) $WEEKLY "$nav" "${rows:-0}" "${mk:-0}" "${PROD:-null}" "$(IFS=,; echo "${STEPS[*]-}")" "$LOG" \
    "$LOCK_STATUS" "$STALE_CLEARED" "$age_field" "$expect" "$nav_behind" "$DO_SYNC" \
    "$JP4_HOST" \
    > "$REPORT.tmp" && mv "$REPORT.tmp" "$REPORT"
  cp "$REPORT" "$LOGDIR/report-$DAY.json"
  release_lock
  log "done status=$STATUS max_nav=$nav expect=$expect nav_behind=$nav_behind"
  launchd_note "DONE status=$STATUS max_nav_date=$nav expected=$expect nav_behind=$nav_behind"
  [ "$STATUS" = fail ] && exit 1; exit 0
}

# --- lock acquire (before any work) ---
acquire_lock; acq_rc=$?
if [ $acq_rc -ne 0 ]; then exit $acq_rc; fi
trap 'release_lock' EXIT

if [ $LOCK_CHECK = 1 ]; then
  log "lock-check ok pid=$$ lock=$LOCK stale_cleared=$STALE_CLEARED"
  launchd_note "LOCK_CHECK ok pid=$$ stale_cleared=$STALE_CLEARED"
  release_lock
  trap - EXIT
  exit 0
fi

log "START pid=$$ ppid=$PPID tz=$(date +%Z%z) args=[$*] weekly=$WEEKLY fetch=$DO_FETCH sync=$DO_SYNC jp4=${JP4_USER}@${JP4_HOST}:${JP4_PORT}"
launchd_note "START pid=$$ ppid=$PPID tz=$(date +%Z%z) args=[$*]"
check_prev_report_stale
cd "$REPO" || { write_fail_report "repo_missing" "$REPO"; exit 2; }
HAS_KEY=0; grep -q '^HITHINK_FINANCE_API_KEY=.\+' .env 2>/dev/null && HAS_KEY=1
if [ $DO_FETCH = 1 ]; then
  step fetch_list 1 1800 bun run fetch:list
  step refresh_select 1 14400 bun run refresh:select
  if [ $HAS_KEY = 1 ]; then step fetch_macro 0 1800 bun run fetch:macro; step fetch_selection 0 0 fetch_selection_retry; fi
  if [ $WEEKLY = 1 ]; then
    for s in dividend fees manager portfolio; do step fetch_$s 0 14400 bun run fetch:$s; done
    step compute_select 0 3600 bun run compute:select
  fi
fi
# verify local
step integrity 1 3600 sh -c "[ \"\$(sqlite3 -readonly '$DB' 'PRAGMA quick_check;')\" = ok ]"
EXPECT=$(expected_nav)
NAV=$(q "select max(nav_date) from fund_nav"); log "max nav_date=$NAV expect>=$EXPECT"
[[ "$NAV" < "$EXPECT" ]] && { STATUS=warn; ERR="$ERR nav_stale($NAV<$EXPECT,holiday?)"; }
[ $DO_SYNC = 1 ] || finish
# snapshot + publish to jp4 (fundly.db only; never auth.db)
if [ $SKIP_UP = 1 ]; then   # reuse fundly.db.new already on jp4 from current local snapshot
  LROWS=$(sqlite3 -readonly "$DB" "select count(*) from fund_nav"); LNAV=$(sqlite3 -readonly "$DB" "select max(nav_date) from fund_nav"); MD5=reuse
else
rm -f "$SNAP" "$SNAP.gz"
step snapshot 1 3600 sqlite3 -readonly "$DB" "VACUUM INTO '$SNAP'"
LROWS=$(sqlite3 -readonly "$SNAP" "select count(*) from fund_nav"); LNAV=$(sqlite3 -readonly "$SNAP" "select max(nav_date) from fund_nav")
step gzip 1 3600 gzip -6 -f "$SNAP"
rm -f "$SNAP"
MD5=$(md5 -q "$SNAP.gz"); [ -n "$MD5" ] || { STATUS=fail; ERR="$ERR md5_empty"; finish; }
fi
upload(){
  ssh_jp4 "rm -f '${JP4_DATA}/fundly.db.new' '${JP4_DATA}/fundly.db.new.gz'"
  scp_jp4 "$SNAP.gz" "${JP4_USER}@${JP4_HOST}:${JP4_DATA}/fundly.db.new.gz"
}
remote_verify(){
  ssh_jp4 "MD5='$MD5' LROWS='$LROWS' LNAV='$LNAV' JP4_DATA='$JP4_DATA' bash -s" <<'REMOTE'
set -euo pipefail
cd "$JP4_DATA"
if [ "$MD5" = reuse ]; then
  [ -f fundly.db.new ]
else
  got=$(md5sum fundly.db.new.gz | cut -d' ' -f1)
  [ "$got" = "$MD5" ]
  gzip -dc fundly.db.new.gz > fundly.db.new
  rm -f fundly.db.new.gz
fi
# jp4 host/container often have no sqlite3 CLI; use python3 or bun:sqlite.
set +e
out=$(python3 -c "import sqlite3,os
p=os.environ['JP4_DATA']+'/fundly.db.new'
d=sqlite3.connect('file:'+p+'?mode=ro', uri=True)
print(d.execute('PRAGMA quick_check').fetchone()[0], d.execute('select count(*) from fund_nav').fetchone()[0], d.execute('select max(nav_date) from fund_nav').fetchone()[0])")
rc=$?
if [ $rc -ne 0 ]; then
  out=$(docker exec fundly-app bun -e 'import { Database } from "bun:sqlite"; const d = new Database("/data/fundly.db.new", { readonly: true }); console.log(d.query("PRAGMA quick_check").get().quick_check, d.query("select count(*) as c from fund_nav").get().c, d.query("select max(nav_date) as m from fund_nav").get().m);')
  rc=$?
fi
set -e
[ $rc -eq 0 ]
read -r qc c m <<<"$out"
echo "CHECK $qc $c $m"
[ "$qc" = ok ] && [ "$c" = "$LROWS" ] && [ "$m" = "$LNAV" ]
REMOTE
}
swap(){
  ssh_jp4 bash -s <<'REMOTE'
set -euo pipefail
DATA=/data/fundly/data
cd "$DATA"
[ -f fundly.db.new ]
rm -f fundly.db.prev fundly.db.bad
mv fundly.db fundly.db.prev
mv fundly.db.new fundly.db
rm -f fundly.db-wal fundly.db-shm fundly.db.prev-wal fundly.db.prev-shm
ls -l "$DATA"
df -h "$DATA"
REMOTE
}
prodnav(){
  ssh_jp4 bash -s 2>/dev/null <<'REMOTE' | tail -1
set -euo pipefail
python3 -c "import sqlite3
d=sqlite3.connect('file:/data/fundly/data/fundly.db?mode=ro', uri=True)
print(d.execute('select max(nav_date) from fund_nav').fetchone()[0])" \
  || docker exec fundly-app bun -e 'import { Database } from "bun:sqlite"; const d = new Database("/data/fundly.db", { readonly: true }); console.log(d.query("select max(nav_date) as m from fund_nav").get().m);'
REMOTE
}
rollback(){
  ssh_jp4 bash -s <<'REMOTE'
set -euo pipefail
DATA=/data/fundly/data
cd "$DATA"
[ -f fundly.db.prev ]
mv fundly.db fundly.db.bad
mv fundly.db.prev fundly.db
rm -f fundly.db-wal fundly.db-shm fundly.db.bad-wal fundly.db.bad-shm
REMOTE
}
# Restart compose web on jp4 and poll /api/live for a process started after the request.
# Sets: NEWPROC (1 = fresh healthy process seen), HEALTH (last probe ok), FIRST_HEALTH_SEC, RESTART_CLI_RC
restart_and_wait(){ local tag=$1 t0 cli el j st up conn comp want
  want="$LIVE_COMPONENT"
  t0=$(date +%s); NEWPROC=0 HEALTH=0 FIRST_HEALTH_SEC=null RESTART_CLI_RC=null
  log "== $tag: docker compose restart web on ${JP4_USER}@${JP4_HOST} (poll $LIVE_URL component=$want up to ${RESTART_WAIT}s)"
  ssh_jp4 "cd /data/fundly && docker compose restart web" >>"$LOG" 2>&1 </dev/null &
  cli=$!
  while :; do
    sleep 10
    el=$(( $(date +%s)-t0 ))
    j=$(curl -s -m 10 "$LIVE_URL" 2>/dev/null)
    read -r st up conn comp <<<"$(printf '%s' "$j" | python3 -c 'import json,sys
try:
  d=json.load(sys.stdin)
  print(d.get("status","-"), int(d.get("uptime",-1)), d.get("database",{}).get("connected"), d.get("component",""))
except Exception: print("- -1 False")' 2>/dev/null)"
    if [ "$st" = ok ] && [ "$conn" = True ] && [ "$comp" = "$want" ]; then HEALTH=1; else HEALTH=0; fi
    if [ $HEALTH = 1 ] && [ "${up:--1}" -ge 0 ] && [ "$up" -le $((el+5)) ]; then NEWPROC=1; FIRST_HEALTH_SEC=$el; break; fi
    [ $el -ge "$RESTART_WAIT" ] && break
  done
  local w=0; while kill -0 $cli 2>/dev/null && [ $w -lt 30 ]; do sleep 1; w=$((w+1)); done
  if kill -0 $cli 2>/dev/null; then
    log "!! $tag: ssh restart still running after outcome known, killing pid=$cli"
    kill_tree $cli; RESTART_CLI_RC=124
  else
    wait $cli; RESTART_CLI_RC=$?
  fi
  STEPS+=("{\"step\":\"$tag\",\"rc\":$([ $NEWPROC = 1 ] && echo 0 || echo 1),\"sec\":$(( $(date +%s)-t0 )),\"cli_rc\":$RESTART_CLI_RC,\"new_process\":$NEWPROC,\"first_health_sec\":$FIRST_HEALTH_SEC,\"component\":\"$comp\"}")
  log "$tag: new_process=$NEWPROC health=$HEALTH component=$comp first_health_sec=$FIRST_HEALTH_SEC cli_rc=$RESTART_CLI_RC"
}
[ $SKIP_UP = 1 ] || step upload 1 5400 upload
step remote_verify 1 1800 remote_verify
T0=$(date +%s)
step swap 1 300 swap
restart_and_wait restart
DOWN=$(( $(date +%s)-T0 ))
CHK=$(run_to 300 prodnav)
if [ $NEWPROC = 1 ] && [ "$CHK" = "$LNAV" ]; then
  PROD="{\"health\":\"ok\",\"max_nav_date\":\"$CHK\",\"swap_to_live_sec\":$DOWN,\"first_health_sec\":$FIRST_HEALTH_SEC,\"restart_cli_rc\":$RESTART_CLI_RC,\"md5\":\"$MD5\",\"host\":\"$JP4_HOST\"}"; rm -f "$SNAP.gz"
elif [ $NEWPROC = 0 ] && [ $HEALTH = 1 ]; then
  log "!! restart unconfirmed: service healthy but no fresh process within ${RESTART_WAIT}s; new db already in place (nav=$CHK). Manual check needed."
  PROD="{\"health\":\"unconfirmed\",\"live\":1,\"new_process\":0,\"nav_file\":\"$CHK\",\"restart_cli_rc\":$RESTART_CLI_RC}"; STATUS=fail; ERR="$ERR restart_unconfirmed"
else
  log "!! prod health failed (new_process=$NEWPROC live=$HEALTH nav=$CHK); rolling back"
  PRE_HEALTH=$HEALTH
  run_to 300 rollback >>"$LOG" 2>&1; restart_and_wait restart_rollback
  PROD="{\"health\":\"rolled_back\",\"live\":$PRE_HEALTH,\"nav\":\"$CHK\",\"rollback_new_process\":$NEWPROC}"; STATUS=fail; ERR="$ERR prod_sync"
fi
finish
