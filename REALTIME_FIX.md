# 🔧 Fixing Real-Time Subscription Error

If you're seeing `❌ Real-time subscription error`, it means the `edit_requests` table isn't enabled for real-time updates in Supabase.

## Quick Fix (2 minutes)

### Method 1: SQL Editor (Recommended)

1. **Go to your Supabase project** → https://app.supabase.com
2. Click **"SQL Editor"** in the left sidebar
3. Click **"New Query"**
4. Copy and paste this **exact SQL**:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE edit_requests;
```

5. Click **"Run"** (or press Cmd/Ctrl + Enter)
6. You should see: **"Success. No rows returned"**
7. **Refresh your app** - real-time should now work!

### Method 2: Database Replication UI

1. Go to your Supabase project
2. Click **"Database"** in left sidebar
3. Click **"Replication"** tab
4. Find the **"supabase_realtime"** publication
5. Click **"Edit"**
6. Make sure **"edit_requests"** is checked in the tables list
7. Click **"Save"**
8. Refresh your app

## Verify It's Working

After applying the fix, refresh your app and look for:

```
✅ Successfully subscribed to real-time updates!
👥 You will now see changes from other users instantly
```

## Test Real-Time

1. Open the app in **two browser windows**
2. In **window 1**: Make an edit and apply
3. In **window 2**: You should see the edit appear automatically! ⚡

## Still Having Issues?

### Check Your Table Exists

Run this in SQL Editor:
```sql
SELECT * FROM edit_requests LIMIT 1;
```

If you get an error, the table doesn't exist. Run the full setup SQL from `QUICK_START.md`.

### Check Real-Time is Enabled for Your Project

1. Go to **Settings** → **API**
2. Scroll down to **"Realtime"** section
3. Make sure realtime is **enabled**

### Check RLS Policies

Run this to check policies:
```sql
SELECT * FROM pg_policies WHERE tablename = 'edit_requests';
```

You should see at least one policy. If not, run:
```sql
-- Enable RLS
ALTER TABLE edit_requests ENABLE ROW LEVEL SECURITY;

-- Allow all operations (for development)
CREATE POLICY "Allow all operations for now" ON edit_requests
  FOR ALL
  USING (true)
  WITH CHECK (true);
```

### Check Console for More Details

After the fix, check your browser console. You should see:
```
📡 Real-time subscription status: SUBSCRIBED
✅ Successfully subscribed to real-time updates!
```

If you see error details, they'll now be logged.

## Common Errors

### "relation 'edit_requests' does not exist"
**Fix:** Create the table using the SQL from `QUICK_START.md`

### "permission denied for publication supabase_realtime"
**Fix:** You might not have admin access. Contact your Supabase project admin.

### "table 'edit_requests' is already part of publication"
**Good!** The table is already enabled. The issue might be elsewhere:
- Check RLS policies
- Check your internet connection
- Check Supabase project is online

## Debugging Commands

Run these in SQL Editor to diagnose:

```sql
-- Check if table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'edit_requests'
);

-- Check if real-time is enabled
SELECT * FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime' 
AND tablename = 'edit_requests';

-- Check RLS status
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'edit_requests';
```

## Need More Help?

1. Check the full console output for `📦 Error details:`
2. Look at Network tab in browser dev tools for failed WebSocket connections
3. Verify your Supabase project is active (check project dashboard)

---

**After fixing, you should be able to see real-time updates across multiple users!** 🎉


