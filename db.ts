import Database from 'better-sqlite3';

const db = new Database('app.db');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS models (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    format TEXT NOT NULL,
    size INTEGER NOT NULL,
    uploadedAt TEXT NOT NULL,
    status TEXT NOT NULL,
    accuracy REAL,
    inferenceTime INTEGER,
    filePath TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    modelId TEXT NOT NULL,
    imageUrl TEXT,
    detections TEXT NOT NULL,
    inferenceTime INTEGER NOT NULL,
    timestamp TEXT NOT NULL
  );
`);

export const models = {
  all: () => db.prepare('SELECT * FROM models ORDER BY uploadedAt DESC').all(),
  get: (id: string) => db.prepare('SELECT * FROM models WHERE id = ?').get(id),
  insert: (model: any) => {
    const stmt = db.prepare(`
      INSERT INTO models (id, name, format, size, uploadedAt, status, accuracy, inferenceTime, filePath)
      VALUES (@id, @name, @format, @size, @uploadedAt, @status, @accuracy, @inferenceTime, @filePath)
    `);
    return stmt.run(model);
  },
  delete: (id: string) => db.prepare('DELETE FROM models WHERE id = ?').run(id)
};

export const reports = {
  all: () => db.prepare('SELECT * FROM reports ORDER BY timestamp DESC').all(),
  insert: (report: any) => {
    const stmt = db.prepare(`
      INSERT INTO reports (id, modelId, imageUrl, detections, inferenceTime, timestamp)
      VALUES (@id, @modelId, @imageUrl, @detections, @inferenceTime, @timestamp)
    `);
    // Convert detections array to JSON string
    return stmt.run({
      ...report,
      detections: JSON.stringify(report.detections)
    });
  },
  delete: (id: string) => db.prepare('DELETE FROM reports WHERE id = ?').run(id)
};

export default db;
