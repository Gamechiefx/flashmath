# Debug Logging Cleanup Reference

> **Created:** January 3, 2026  
> **Purpose:** Document all debug instrumentation added during 5v5 queue/redirect bug fix  
> **Status:** Keep for now - remove when 5v5 system is stable

---

## Overview

Debug logging was added to diagnose and fix the infinite redirect loop bug between the team setup and queue pages. This instrumentation should be removed once the 5v5 matching and queuing system is fully stable.

### What to Search For

```bash
# Find all client-side fetch debug calls (36 total)
grep -r "fetch('http://127.0.0.1:7244" src/

# Find all #region agent log blocks (42 total)
grep -rn "#region agent log" src/ server.js

# Find all server-side file logging
grep -rn "appendFileSync.*debug.log" src/ server.js
```

---

## Files with Debug Logging

### 1. `src/app/arena/teams/queue/team-queue-client.tsx`
**13 fetch() calls**

| Line | Location ID | Purpose |
|------|-------------|---------|
| ~71 | `MOUNT` | Log when queue page mounts with initial state |
| ~134 | `FRESH_STATUS_CHECK` | Track fresh queue status check on mount |
| ~162 | `SOCKET_EFFECT` | Track socket event processing |
| ~170 | `SOCKET_WRONG_PARTY` | Log when socket update is for different party |
| ~182 | `SOCKET_ALREADY_REDIRECTING` | Log when redirect is blocked (already redirecting) |
| ~189 | `SOCKET_REDIRECTING_TO_SETUP` | Log when redirecting to setup via socket |
| ~262 | `NON_LEADER_REDIRECT` | Non-leader redirect due to null queueStatus |
| ~368 | `TEAMMATE_PHASE_REDIRECT` | Teammate phase redirect to setup |
| ~591 | `OPPONENT_FRESH_CHECK` | Fresh party data check for opponent phase |
| ~602 | `OPPONENT_REDIRECT_TO_SETUP` | Opponent phase redirect to setup |
| ~617 | `JOINING_OPPONENT_QUEUE` | About to join opponent queue |
| ~704 | `LEAVE_QUEUE_BEFORE_CLEAR` | About to clear queue status |
| ~716 | `LEAVE_QUEUE_AFTER_CLEAR` | Queue status cleared in DB |

**Also has:**
- `console.log` statements for real-time debugging (can keep or remove)
- Module-level `redirectingParties` Set (keep - part of fix)

---

### 2. `src/app/arena/teams/setup/team-setup-client.tsx`
**18 fetch() calls**

| Line | Location ID | Purpose |
|------|-------------|---------|
| ~69 | `RENDER` | Track component render count |
| ~83 | `MOUNT` | Log when setup page mounts |
| ~132 | `MOUNT_EFFECT` | Mount effect execution |
| ~147 | `BLOCKED_BY_PROP` | Blocked by fromQueue prop |
| ~155 | `UNBLOCK_AFTER_GRACE` | Unblocked after grace period |
| ~210 | `POLL_RESULT` | Party poll result |
| ~233 | `AUTO_REDIRECT_EFFECT` | Auto-redirect effect triggered |
| ~252 | `NEW_QUEUE_REDIRECT` | New queue detected - redirecting |
| ~300 | `EXISTING_QUEUE_REDIRECT` | Redirecting to existing queue |
| ~315 | `SOCKET_EFFECT` | Socket effect triggered |
| ~323 | `SOCKET_WRONG_PARTY` | Socket update for different party |
| ~331 | `SOCKET_NULL_STATUS` | Socket update with null status |
| ~342 | `SOCKET_ALREADY_REDIRECTING` | Already redirecting |
| ~349 | `SOCKET_REDIRECTING` | Following leader to queue |
| ~428 | `START_QUEUE` | Leader starting queue |
| ~439 | `SOCKET_NOTIFY_START` | Socket notification for queue start |
| ~454 | `FIND_TEAMMATES` | Leader starting teammate search |
| ~465 | `SOCKET_NOTIFY_TEAMMATES` | Socket notification for teammates |

**Also has:**
- `setupRenderCount` global variable (can remove)
- `console.log` statements (can keep or remove)

---

### 3. `src/lib/socket/use-presence.ts`
**5 fetch() calls**

| Line | Location ID | Purpose |
|------|-------------|---------|
| ~113 | `SOCKET_EFFECT_TRIGGER` | Socket useEffect triggered |
| ~214 | `SOCKET_RECEIVED` | Received queue status change via socket |
| ~223 | `HANDLER_REGISTER` | Registering socket handlers |
| ~250 | `HANDLER_CLEANUP` | Cleaning up socket handlers |
| ~317 | `SOCKET_EMIT` | Emitting queue status change notification |

**Also has:**
- `socketConnectionCount` module variable (can remove)
- `handlerRegistrationCount` module variable (can remove)
- `console.log` statements (can keep or remove)

---

### 4. `src/lib/actions/social.ts`
**Server-side file logging (2 locations)**

| Line | Location ID | Purpose |
|------|-------------|---------|
| ~692-705 | `getPartyData` | Log returned party data |
| ~1413-1426 | `updatePartyQueueStatus` | Log queue status updates |

**Pattern to remove:**
```typescript
// #region agent log - ...
try {
    const fs = require('fs');
    const logEntry = JSON.stringify({...}) + '\n';
    fs.appendFileSync('/home/evan.hill/FlashMath/.cursor/debug.log', logEntry);
} catch (e) { /* ignore logging errors */ }
// #endregion
```

---

### 5. `src/app/arena/teams/setup/page.tsx`
**1 console.log statement**

| Line | Purpose |
|------|---------|
| ~34 | `[TeamSetup:Server] Page render` - logs partyId, queueStatus, fromQueue |

---

### 6. `server.js`
**Server-side file logging (3 locations)**

| Line | Location ID | Purpose |
|------|-------------|---------|
| ~973-987 | `USER_JOINED_ROOM` | User joined their socket room |
| ~1139-1151 | `SOCKET_BROADCAST` | Broadcasting queue status to party |
| ~1156-1169 | `EMIT_TO_MEMBER` | Emitting to individual member |

---

## Cleanup Steps

When ready to remove debug logging:

### Step 1: Remove all fetch() calls
Search for `#region agent log` and remove the entire block including:
- `// #region agent log`
- The `fetch()` call
- `// #endregion`

### Step 2: Remove server-side file logging
Search for `appendFileSync.*debug.log` and remove the entire try/catch block.

### Step 3: Remove module-level counters
Remove these variables:
- `setupRenderCount` in team-setup-client.tsx
- `queueRenderCount` in team-queue-client.tsx (already removed)
- `socketConnectionCount` in use-presence.ts
- `handlerRegistrationCount` in use-presence.ts

### Step 4: Decide on console.log statements
These are useful for browser DevTools debugging. You can:
- Keep them (recommended during development)
- Remove them for production
- Make them conditional: `if (process.env.NODE_ENV === 'development')`

### Step 5: Clear the debug log file
```bash
rm -f /home/evan.hill/FlashMath/.cursor/debug.log
```

---

## Quick Cleanup Commands

```bash
# Preview what will be removed
grep -rn "#region agent log" src/ server.js

# Count remaining debug calls
grep -c "fetch('http://127.0.0.1:7244" src/app/arena/teams/queue/team-queue-client.tsx
grep -c "fetch('http://127.0.0.1:7244" src/app/arena/teams/setup/team-setup-client.tsx
grep -c "fetch('http://127.0.0.1:7244" src/lib/socket/use-presence.ts

# Clear debug log
rm -f .cursor/debug.log
```

---

## Related Bug Fix

These logs were added to diagnose and fix:
- **Issue:** Infinite redirect loop between `/arena/teams/setup` and `/arena/teams/queue`
- **Root Cause:** Next.js client-side router cache serving stale `queueStatus` data
- **Fix:** 
  1. Added `export const dynamic = 'force-dynamic'` to disable caching
  2. Implemented real-time Socket.io synchronization for queue status
  3. Added module-level `redirectingParties` Set to persist state across Fast Refresh
  4. Added server-side redirect check in queue page.tsx

**Key files for the actual fix (DO NOT REMOVE):**
- `redirectingParties` Set in team-queue-client.tsx
- `usePresence` hook with userId/userName props
- `export const dynamic = 'force-dynamic'` in page.tsx files
- Socket.io `party:queue_status_changed` event handling

