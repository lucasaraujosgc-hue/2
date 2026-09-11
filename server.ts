import express from "express";
import path from "path";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import { db } from "./src/db";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: "50mb" }));

  // Exemplo de rota da API para testar o banco de dados
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      db: db.open ? "connected" : "disconnected",
      message: "Banco de dados better-sqlite3 inicializado com sucesso"
    });
  });

  // API frequencia
  app.get("/api/frequencia", (req, res) => {
    try {
      const rows = db.prepare('SELECT * FROM frequencia ORDER BY semana ASC, escola ASC').all();
      res.json(rows);
    } catch (err) {
      console.error("Error fetching frequencia", err);
      res.status(500).json({ error: "Failed to fetch frequencia" });
    }
  });

  app.post("/api/frequencia/bulk", (req, res) => {
    try {
      const records = req.body.records;
      if (!Array.isArray(records)) {
        return res.status(400).json({ error: "Records must be an array" });
      }

      // We use a transaction for performance
      const insert = db.prepare(`
        INSERT OR REPLACE INTO frequencia 
        (id, escola, porcentagem, semana, tipo)
        VALUES (@id, @escola, @porcentagem, @semana, @tipo)
      `);
      
      const insertMany = db.transaction((rows) => {
        for (const row of rows) insert.run(row);
      });

      insertMany(records);
      res.json({ success: true, count: records.length });
    } catch (err) {
      console.error("Error inserting frequencia in bulk", err);
      res.status(500).json({ error: "Failed to save frequencia" });
    }
  });

  app.delete("/api/frequencia/:id", (req, res) => {
    try {
      const id = req.params.id;
      db.prepare('DELETE FROM frequencia WHERE id = ?').run(id);
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting frequencia", err);
      res.status(500).json({ error: "Failed to delete frequencia" });
    }
  });

  app.delete("/api/frequencia/clear/:tipo", (req, res) => {
    try {
      const tipo = req.params.tipo;
      db.prepare('DELETE FROM frequencia WHERE tipo = ?').run(tipo);
      res.json({ success: true });
    } catch (err) {
      console.error("Error clearing frequencia", err);
      res.status(500).json({ error: "Failed to clear frequencia" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Modo de produção: serve os arquivos estáticos compilados do React
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor rodando na porta ${PORT}`);
  });
}

startServer();
