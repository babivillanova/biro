# Supabase Setup Guide

## 1. Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Sign up or log in
3. Click "New Project"
4. Fill in:
   - Project name: `biro-editor` (or your choice)
   - Database password: (choose a strong password)
   - Region: (choose closest to your users)
5. Wait for project to be created (~2 minutes)

## 2. Get Your API Credentials

1. Go to Project Settings → API
2. Copy the following:
   - **Project URL** (under "Project URL") 
   - **anon/public key** (under "Project API keys") 

## 3. Configure Your App

1. Create a `.env` file in the `biro` directory (copy from `.env.example`):
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your credentials:
   ```
   REACT_APP_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
   REACT_APP_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

3. **IMPORTANT**: Make sure `.env` is in your `.gitignore` (it should be by default with Create React App)

## 4. Create Database Schema

1. In your Supabase project, go to **SQL Editor**
2. Click "New Query"
3. Copy and paste the following SQL:

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

-- Create index for faster queries
CREATE INDEX idx_edit_requests_model_id ON edit_requests(model_id);
CREATE INDEX idx_edit_requests_created_at ON edit_requests(created_at);
CREATE INDEX idx_edit_requests_sequence ON edit_requests(model_id, sequence_order);

-- Enable Row Level Security (RLS)
ALTER TABLE edit_requests ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations for now (adjust later for multi-user auth)
CREATE POLICY "Allow all operations for now" ON edit_requests
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Enable real-time for the table
ALTER PUBLICATION supabase_realtime ADD TABLE edit_requests;
```

4. Click "Run" to execute the SQL

## 5. Test Your Connection

1. Restart your React app:
   ```bash
   npm start
   ```

2. Open browser console and check for connection logs
3. Try editing an element and applying changes
4. Check Supabase Dashboard → Table Editor → edit_requests to see if data appears

## 6. Optional: Set Up Authentication

For production multi-user scenarios:

1. Go to Authentication → Settings in Supabase
2. Enable providers (Email, Google, GitHub, etc.)
3. Update RLS policies to restrict access based on user_id

## Database Schema

### `edit_requests` table

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key, auto-generated |
| `model_id` | TEXT | ID of the BIM model being edited |
| `request_type` | INTEGER | Type of edit (geometry, material, transform, etc.) |
| `local_id` | TEXT | Local ID of the element being edited |
| `request_data` | JSONB | Full request object with all edit details |
| `user_id` | TEXT | IP address of user who made the edit (for tracking) |
| `created_at` | TIMESTAMP | When the edit was made |
| `is_undone` | BOOLEAN | Whether this edit has been undone |
| `sequence_order` | INTEGER | Order of operations for undo/redo |

## Real-Time Subscription

The app automatically subscribes to changes on the `edit_requests` table. When any user applies changes:

1. Request is saved to Supabase
2. All connected clients receive the update via WebSocket
3. History menu updates automatically
4. 3D view updates with new changes

## Troubleshooting

### Connection Error
- Verify `.env` has correct credentials
- Check that you restarted the app after creating `.env`
- Verify Supabase project is active

### No Real-Time Updates
- Make sure you ran the `ALTER PUBLICATION` command
- Check browser console for subscription errors
- Verify RLS policies allow reads

### Data Not Saving
- Check RLS policies allow writes
- Verify network tab shows successful POST requests
- Check Supabase Dashboard logs for errors

