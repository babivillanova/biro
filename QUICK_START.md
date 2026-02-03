# 🚀 Quick Start: Multi-User Collaborative Editing

Your BIM editor is now configured to sync edits across multiple users in real-time using Supabase!

## What Changed

✅ **Edit requests now save to database** instead of just locally  
✅ **Real-time sync** - when anyone applies changes, all users see them instantly  
✅ **Persistent history** - edit history is saved across sessions  
✅ **Timestamps** - see when each edit was made  

## Setup Steps (5 minutes)

### 1. Create Supabase Account

```bash
# Go to: https://supabase.com
# Click "Start your project" → Sign up (free)
```

### 2. Create New Project

1. Click **"New Project"**
2. Fill in:
   - **Name**: `biro-editor` (or anything you like)
   - **Database Password**: (create a strong password - save it!)
   - **Region**: Choose closest to you
3. Wait ~2 minutes for project creation

### 3. Get Your API Keys

1. In your Supabase project, click **Settings** (gear icon) → **API**
2. Copy these two values:
   - **Project URL** (looks like: `https://xxxxx.supabase.co`)
   - **anon public** key (long string starting with `eyJ...`)

### 4. Configure Your App

```bash
# In the biro directory, create a .env file:
touch .env

# Edit .env and add (replace with your actual values):
REACT_APP_SUPABASE_URL=https://your-project-id.supabase.co
REACT_APP_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...your-key-here
```

### 5. Create Database Table

1. In Supabase, go to **SQL Editor** (left sidebar)
2. Click **"New Query"**
3. Paste this SQL:

```sql
-- Create edit_requests table
CREATE TABLE edit_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id TEXT NOT NULL,
  request_type INTEGER NOT NULL,
  local_id TEXT NOT NULL,
  request_data JSONB NOT NULL,
  user_id TEXT,  -- Stores IP address for user tracking
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_undone BOOLEAN DEFAULT FALSE,
  sequence_order INTEGER
);

-- Create indexes for faster queries
CREATE INDEX idx_edit_requests_model_id ON edit_requests(model_id);
CREATE INDEX idx_edit_requests_created_at ON edit_requests(created_at);
CREATE INDEX idx_edit_requests_sequence ON edit_requests(model_id, sequence_order);

-- Enable Row Level Security
ALTER TABLE edit_requests ENABLE ROW LEVEL SECURITY;

-- Allow all operations (adjust later for production)
CREATE POLICY "Allow all operations for now" ON edit_requests
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Enable real-time subscriptions
ALTER PUBLICATION supabase_realtime ADD TABLE edit_requests;
```

4. Click **"Run"** (or press Cmd/Ctrl + Enter)
5. You should see "Success. No rows returned"

### 6. Restart Your App

```bash
# Stop your app (Ctrl+C if running)
# Start it again:
npm start
```

## ✅ Testing It Works

1. **Open your app** in browser
2. **Double-click an element** to select it
3. **Move or rotate it**
4. **Click "Apply changes"**
5. Check browser console - you should see:
   ```
   ✅ Subscribed to real-time updates
   Saved requests to database: [...]
   ```
6. Go to Supabase → **Table Editor** → **edit_requests**
   - You should see your edit saved!

## 🎉 Multi-User Testing

To test real-time collaboration:

1. **Open the app in TWO browser windows** (or different browsers)
2. In **Window 1**: Make an edit and apply changes
3. In **Window 2**: Watch the history menu update automatically! ✨
4. The 3D view updates in real-time

## 🎨 What You'll See

The history menu now shows:
- **Edit type** (e.g., "Transform", "Material")
- **Element ID**
- **Timestamp** (when the edit was made)
- Real-time updates from other users

## 🔧 Troubleshooting

### "Connection refused" error
- Check that `.env` has correct `REACT_APP_SUPABASE_URL` and `REACT_APP_SUPABASE_ANON_KEY`
- Make sure you restarted the app after creating `.env`

### No real-time updates
- Verify you ran the `ALTER PUBLICATION` SQL command
- Check browser console for subscription status
- Make sure RLS policy allows reads

### Edits not saving
- Check browser console for errors
- Verify the table was created (Supabase → Table Editor)
- Check RLS policy allows writes

### Can't find .env file
- Make sure it's in `/Users/barbaravillanova/Documents/github/biro/biro/.env`
- It won't appear in most file explorers (starts with `.`)
- Use `ls -la` in terminal to see it

## 📚 Next Steps

For production deployment, see `SUPABASE_SETUP.md` for:
- User authentication setup
- Row-level security configuration
- Performance optimization
- Deployment to Vercel/Netlify

## Need Help?

Common issues are covered in `SUPABASE_SETUP.md`

Happy collaborative editing! 🎨✨

