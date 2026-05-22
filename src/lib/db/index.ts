import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const DATA_DIR = path.join(process.cwd(), 'data')
const DB_PATH = path.join(DATA_DIR, 'wacrm.db')

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (_db) return _db
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
  _db = new Database(DB_PATH)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  initSchema(_db)
  runMigrations(_db)
  return _db
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      full_name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL,
      avatar_url TEXT,
      role TEXT DEFAULT 'user',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id)
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      phone TEXT NOT NULL,
      name TEXT,
      email TEXT,
      company TEXT,
      avatar_url TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
    CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);

    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#3b82f6',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS contact_tags (
      id TEXT PRIMARY KEY,
      contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(contact_id, tag_id)
    );

    CREATE INDEX IF NOT EXISTS idx_contact_tags_contact ON contact_tags(contact_id);
    CREATE INDEX IF NOT EXISTS idx_contact_tags_tag ON contact_tags(tag_id);

    CREATE TABLE IF NOT EXISTS custom_fields (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      field_name TEXT NOT NULL,
      field_type TEXT NOT NULL DEFAULT 'text',
      field_options TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS contact_custom_values (
      id TEXT PRIMARY KEY,
      contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      custom_field_id TEXT NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE,
      value TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(contact_id, custom_field_id)
    );

    CREATE TABLE IF NOT EXISTS contact_notes (
      id TEXT PRIMARY KEY,
      contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      note_text TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'open',
      assigned_agent_id TEXT,
      last_message_text TEXT,
      last_message_at TEXT,
      unread_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_contact_id ON conversations(contact_id);

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender_type TEXT NOT NULL DEFAULT 'agent',
      sender_id TEXT,
      content_type TEXT NOT NULL DEFAULT 'text',
      content_text TEXT,
      media_url TEXT,
      template_name TEXT,
      message_id TEXT,
      status TEXT NOT NULL DEFAULT 'sent',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_messages_message_id ON messages(message_id);

    CREATE TABLE IF NOT EXISTS whatsapp_config (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      phone_number_id TEXT NOT NULL,
      waba_id TEXT,
      access_token TEXT NOT NULL,
      verify_token TEXT,
      status TEXT NOT NULL DEFAULT 'disconnected',
      connected_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id)
    );

    CREATE TABLE IF NOT EXISTS message_templates (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Marketing',
      language TEXT DEFAULT 'en_US',
      header_type TEXT,
      header_content TEXT,
      body_text TEXT NOT NULL,
      footer_text TEXT,
      buttons TEXT,
      status TEXT DEFAULT 'Draft',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pipelines (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS pipeline_stages (
      id TEXT PRIMARY KEY,
      pipeline_id TEXT NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      color TEXT NOT NULL DEFAULT '#3b82f6',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_pipeline_stages_pipeline ON pipeline_stages(pipeline_id);

    CREATE TABLE IF NOT EXISTS deals (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      pipeline_id TEXT NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
      stage_id TEXT NOT NULL REFERENCES pipeline_stages(id),
      contact_id TEXT NOT NULL REFERENCES contacts(id),
      conversation_id TEXT REFERENCES conversations(id),
      title TEXT NOT NULL,
      value REAL NOT NULL DEFAULT 0,
      currency TEXT DEFAULT 'USD',
      notes TEXT,
      expected_close_date TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_deals_pipeline ON deals(pipeline_id);
    CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage_id);

    CREATE TABLE IF NOT EXISTS broadcasts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      template_name TEXT NOT NULL,
      template_language TEXT NOT NULL DEFAULT 'en_US',
      template_variables TEXT,
      audience_filter TEXT,
      scheduled_at TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      total_recipients INTEGER DEFAULT 0,
      sent_count INTEGER DEFAULT 0,
      delivered_count INTEGER DEFAULT 0,
      read_count INTEGER DEFAULT 0,
      replied_count INTEGER DEFAULT 0,
      failed_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS broadcast_recipients (
      id TEXT PRIMARY KEY,
      broadcast_id TEXT NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
      contact_id TEXT NOT NULL REFERENCES contacts(id),
      wamid TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      sent_at TEXT,
      delivered_at TEXT,
      read_at TEXT,
      replied_at TEXT,
      error_message TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_broadcast ON broadcast_recipients(broadcast_id);

    CREATE TABLE IF NOT EXISTS automations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      trigger_type TEXT NOT NULL,
      trigger_config TEXT NOT NULL DEFAULT '{}',
      is_active INTEGER NOT NULL DEFAULT 0,
      execution_count INTEGER NOT NULL DEFAULT 0,
      last_executed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_automations_user_id ON automations(user_id);
    CREATE INDEX IF NOT EXISTS idx_automations_active_trigger ON automations(trigger_type);

    CREATE TABLE IF NOT EXISTS automation_steps (
      id TEXT PRIMARY KEY,
      automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
      parent_step_id TEXT REFERENCES automation_steps(id) ON DELETE CASCADE,
      branch TEXT,
      step_type TEXT NOT NULL,
      step_config TEXT NOT NULL DEFAULT '{}',
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_automation_steps_automation_id ON automation_steps(automation_id, position);

    CREATE TABLE IF NOT EXISTS automation_logs (
      id TEXT PRIMARY KEY,
      automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
      trigger_event TEXT NOT NULL DEFAULT '',
      steps_executed TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'success',
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_automation_logs_automation ON automation_logs(automation_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_automation_logs_user ON automation_logs(user_id);

    CREATE TABLE IF NOT EXISTS automation_pending_executions (
      id TEXT PRIMARY KEY,
      automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
      log_id TEXT REFERENCES automation_logs(id) ON DELETE CASCADE,
      parent_step_id TEXT REFERENCES automation_steps(id) ON DELETE SET NULL,
      branch TEXT,
      next_step_position INTEGER NOT NULL,
      context TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'pending',
      run_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_automation_pending_due ON automation_pending_executions(run_at);

    CREATE TABLE IF NOT EXISTS message_actions (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      action_type TEXT NOT NULL DEFAULT 'reaction',
      emoji TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS message_reactions (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      actor_type TEXT NOT NULL DEFAULT 'agent',
      actor_id TEXT NOT NULL,
      emoji TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(message_id, actor_type, actor_id)
    );

    CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON message_reactions(message_id);
    CREATE INDEX IF NOT EXISTS idx_message_reactions_conversation ON message_reactions(conversation_id);
  `)
}

// JSON columns that need serialization/deserialization
const JSON_COLUMNS = new Set([
  'field_options', 'buttons', 'template_variables', 'audience_filter',
  'trigger_config', 'step_config', 'step_results', 'steps_executed', 'context',
])

// Idempotent column additions for existing databases (ALTER TABLE IF NOT EXISTS is
// not supported in SQLite, so we catch the "duplicate column" error instead)
function runMigrations(db: Database.Database): void {
  const addCol = (sql: string) => { try { db.exec(sql) } catch { /* already exists */ } }

  // automation_logs — fix: add missing columns that old schema lacked
  addCol("ALTER TABLE automation_logs ADD COLUMN created_at TEXT DEFAULT (datetime('now'))")
  addCol("ALTER TABLE automation_logs ADD COLUMN trigger_event TEXT DEFAULT ''")
  addCol("ALTER TABLE automation_logs ADD COLUMN user_id TEXT DEFAULT ''")
  addCol("ALTER TABLE automation_logs ADD COLUMN steps_executed TEXT DEFAULT '[]'")

  // automations — add columns added in real migrations
  addCol("ALTER TABLE automations ADD COLUMN description TEXT")
  addCol("ALTER TABLE automations ADD COLUMN last_executed_at TEXT")

  // profiles — ensure avatar storage bucket column exists
  addCol("ALTER TABLE profiles ADD COLUMN avatar_url TEXT")

  // broadcast_recipients — wamid column from migration 003
  addCol("ALTER TABLE broadcast_recipients ADD COLUMN wamid TEXT")

  // deals — position column from migration 002
  addCol("ALTER TABLE deals ADD COLUMN position INTEGER DEFAULT 0")

  // messages — reply threading column
  addCol("ALTER TABLE messages ADD COLUMN reply_to_message_id TEXT REFERENCES messages(id)")

  // broadcast_recipients — whatsapp_message_id for status tracking
  addCol("ALTER TABLE broadcast_recipients ADD COLUMN whatsapp_message_id TEXT")
}

export function serializeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if (JSON_COLUMNS.has(k) && v !== null && v !== undefined) {
      out[k] = typeof v === 'string' ? v : JSON.stringify(v)
    } else {
      out[k] = v
    }
  }
  return out
}

export function deserializeRow(row: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!row) return null
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if (JSON_COLUMNS.has(k) && typeof v === 'string') {
      try { out[k] = JSON.parse(v) } catch { out[k] = v }
    } else {
      out[k] = v
    }
  }
  return out
}

export function deserializeRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map(r => deserializeRow(r) as Record<string, unknown>)
}
