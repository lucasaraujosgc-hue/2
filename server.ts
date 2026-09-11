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

  app.put("/api/frequencia/:id", (req, res) => {
    try {
      const id = req.params.id;
      const { escola, porcentagem, semana } = req.body;
      db.prepare('UPDATE frequencia SET escola = ?, porcentagem = ?, semana = ? WHERE id = ?').run(escola, porcentagem, semana, id);
      res.json({ success: true });
    } catch (err) {
      console.error("Error updating frequencia", err);
      res.status(500).json({ error: "Failed to update frequencia" });
    }
  });

  app.put("/api/frequencia/school/:tipo/:oldEscola", (req, res) => {
    try {
      const { tipo, oldEscola } = req.params;
      const { newEscola } = req.body;
      db.prepare('UPDATE frequencia SET escola = ? WHERE tipo = ? AND escola = ?').run(newEscola, tipo, oldEscola);
      res.json({ success: true });
    } catch (err) {
      console.error("Error updating school name", err);
      res.status(500).json({ error: "Failed to update school name" });
    }
  });

  app.delete("/api/frequencia/school/:tipo/:escola", (req, res) => {
    try {
      const { tipo, escola } = req.params;
      db.prepare('DELETE FROM frequencia WHERE tipo = ? AND escola = ?').run(tipo, escola);
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting school", err);
      res.status(500).json({ error: "Failed to delete school" });
    }
  });

  app.delete("/api/frequencia/period/:tipo/:semana", (req, res) => {
    try {
      const { tipo, semana } = req.params;
      db.prepare('DELETE FROM frequencia WHERE tipo = ? AND semana = ?').run(tipo, semana);
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting period", err);
      res.status(500).json({ error: "Failed to delete period" });
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
