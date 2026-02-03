# 📋 Console Logs Guide

## What Logs to Expect

When your BIM editor is running with Supabase integration, you'll see detailed console logs at every step. Here's what to expect:

---

## 🚀 On Page Load

### 1. Initial Connection
```
🔌 Supabase client initialized
📍 Project URL: https://xxxxx.supabase.co
🚀 Initializing BIM Editor with Supabase integration...
```

**If NOT configured:**
```
⚠️ SUPABASE NOT CONFIGURED: Please create .env file with your credentials
📝 See QUICK_START.md for setup instructions
```

### 2. Real-Time Setup
```
🔔 Setting up real-time subscription...
📡 Listening for changes to model: medium_test
✅ Successfully subscribed to real-time updates!
👥 You will now see changes from other users instantly
```

### 3. Loading History
```
📚 Loading edit history from Supabase...
✅ Loaded 5 requests from database (42.50ms)
```

**If empty:**
```
📚 Loading edit history from Supabase...
✅ Loaded 0 requests from database (25.30ms)
📝 No edit history found
```

### 4. Ready!
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎉 Supabase integration ready!
📝 Features enabled:
   ✓ Real-time collaboration
   ✓ Persistent edit history
   ✓ Multi-user sync
💡 Make an edit and check the console logs
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## ✏️ When You Apply Changes

### 1. Saving to Database
```
💾 Saving to Supabase...
{
  model_id: "medium_test",
  num_requests: 1
}
```

### 2. Success
```
✅ Saved 1 requests to database (89.23ms)
📦 Saved data: [{id: "...", model_id: "medium_test", ...}]
```

### 3. Reload History
```
📚 Loading edit history from Supabase...
✅ Loaded 6 requests from database (38.15ms)
```

---

## ⚡ When Another User Edits (Real-Time)

In your browser console, you'll see:

```
⚡ Real-time update received!
{
  eventType: "INSERT",
  timestamp: "2:45:30 PM"
}
📦 Payload: {
  new: {...},
  old: null,
  eventType: "INSERT"
}
🆕 New edit detected, applying to local view...
✅ Local view updated with remote changes
📚 Loading edit history from Supabase...
✅ Loaded 7 requests from database (45.12ms)
```

**This means another user just made an edit and you're seeing it in real-time!** 🎉

---

## 🔌 On Page Close

```
🔌 Unsubscribed from real-time updates
```

---

## ❌ Error Scenarios

### Database Connection Error
```
❌ Error saving to Supabase: Error: ...
Error details: {
  message: "...",
  details: "...",
  hint: "..."
}
```

**Common causes:**
- Wrong API credentials in `.env`
- Table doesn't exist
- RLS policies blocking access

### Real-Time Subscription Error
```
❌ Real-time subscription error
💡 Check that real-time is enabled for edit_requests table
```

**Fix:** Run the `ALTER PUBLICATION` SQL command from `QUICK_START.md`

### Timeout Error
```
⏱️ Real-time subscription timed out
```

**Fix:** Check network connection and Supabase project status

---

## 🔍 Debugging Tips

### Check Supabase Client Status
In browser console, type:
```javascript
console.log(window.supabaseChannel)
```

Should show the active channel subscription.

### Check Connection
```javascript
// In console
fetch('https://your-project.supabase.co/rest/v1/')
  .then(r => r.text())
  .then(console.log)
```

Should return Supabase API info if connected.

### Force History Reload
If history seems stuck, refresh manually in console:
```javascript
// This won't work directly, but you can reload the page
location.reload()
```

---

## 📊 Performance Metrics

You'll see timing for every operation:

```
✅ Saved 1 requests to database (89.23ms)
                                  ↑
                            response time
```

**Good performance:**
- Save: < 200ms
- Load: < 100ms  
- Real-time notification: < 500ms

**Slow (check network):**
- Save: > 1000ms
- Load: > 500ms

---

## 🎯 Expected Flow (Complete Example)

When you edit an element and apply changes:

```
1. 💾 Saving to Supabase... {model_id: "medium_test", num_requests: 1}
2. ✅ Saved 1 requests to database (89.23ms)
3. 📦 Saved data: [{id: "abc-123", ...}]
4. 📚 Loading edit history from Supabase...
5. ✅ Loaded 3 requests from database (42.50ms)
```

**In another browser window (or another user), immediately:**
```
1. ⚡ Real-time update received! {eventType: "INSERT", timestamp: "2:45:30 PM"}
2. 📦 Payload: {new: {...}, old: null, eventType: "INSERT"}
3. 🆕 New edit detected, applying to local view...
4. ✅ Local view updated with remote changes
5. 📚 Loading edit history from Supabase...
6. ✅ Loaded 3 requests from database (38.15ms)
```

---

## 🧪 Testing Checklist

Open browser console (F12) and verify you see:

- [ ] `🔌 Supabase client initialized`
- [ ] `✅ Successfully subscribed to real-time updates!`
- [ ] `🎉 Supabase integration ready!`
- [ ] When you edit: `💾 Saving to Supabase...`
- [ ] `✅ Saved N requests to database`
- [ ] Open 2nd window and edit in 1st
- [ ] In 2nd window: `⚡ Real-time update received!`
- [ ] In 2nd window: `✅ Local view updated with remote changes`

If you see all these, **everything is working perfectly!** ✨

---

## 🆘 Still No Logs?

1. **Open browser console** (F12 or Right-click → Inspect → Console)
2. **Refresh the page**
3. **Check Console tab** (not Network or Elements)
4. **Look for the 🔌 emoji** - that's the first log
5. **If you see warnings** (⚠️), read them - they tell you what's wrong

The logs are designed to be self-explanatory with emojis and clear messages!


