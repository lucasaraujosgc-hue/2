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
      const rows = db.prepare(`
        SELECT 
          f.id, 
          f.escola, 
          f.porcentagem, 
          f.semana, 
          f.tipo, 
          f.createdAt,
          COALESCE(NULLIF(em.matriculados, 0), NULLIF(f.matriculados, 0), NULL) as matriculados
        FROM frequencia f
        LEFT JOIN escola_matriculas em ON f.escola = em.escola AND f.tipo = em.tipo
        ORDER BY f.semana ASC, f.escola ASC
      `).all();
      res.json(rows);
    } catch (err) {
      console.error("Error fetching frequencia", err);
      res.status(500).json({ error: "Failed to fetch frequencia" });
    }
  });

  // API matriculas por tipo (para gerenciamento de alunos matriculados)
  app.get("/api/matriculas/:tipo", (req, res) => {
    try {
      const tipo = req.params.tipo;
      const rows = db.prepare(`
        SELECT 
          f.escola,
          f.tipo,
          COALESCE(NULLIF(em.matriculados, 0), NULLIF(MAX(f.matriculados), 0), 0) as matriculados
        FROM frequencia f
        LEFT JOIN escola_matriculas em ON f.escola = em.escola AND f.tipo = em.tipo
        WHERE f.tipo = ?
        GROUP BY f.escola, f.tipo
        ORDER BY f.escola ASC
      `).all(tipo);
      res.json(rows);
    } catch (err) {
      console.error("Error fetching matriculas", err);
      res.status(500).json({ error: "Failed to fetch matriculas" });
    }
  });

  // Salvar ou atualizar matriculas de uma ou várias escolas
  app.post("/api/matriculas", (req, res) => {
    try {
      const { escola, tipo, matriculados, updates } = req.body;

      const upsertStmt = db.prepare(`
        INSERT OR REPLACE INTO escola_matriculas (escola, tipo, matriculados)
        VALUES (?, ?, ?)
      `);

      const updateFreqStmt = db.prepare(`
        UPDATE frequencia SET matriculados = ?
        WHERE escola = ? AND tipo = ?
      `);

      const saveSingle = (esc: string, tp: string, mat: number) => {
        const val = Math.max(0, parseInt(String(mat), 10) || 0);
        upsertStmt.run(esc, tp, val);
        updateFreqStmt.run(val, esc, tp);
      };

      if (Array.isArray(updates)) {
        const runTransaction = db.transaction((list: any[]) => {
          for (const item of list) {
            if (item.escola && item.tipo) {
              saveSingle(item.escola, item.tipo, item.matriculados);
            }
          }
        });
        runTransaction(updates);
      } else if (escola && tipo) {
        saveSingle(escola, tipo, matriculados);
      } else {
        return res.status(400).json({ error: "Invalid payload for matriculas" });
      }

      res.json({ success: true });
    } catch (err) {
      console.error("Error saving matriculas", err);
      res.status(500).json({ error: "Failed to save matriculas" });
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
        (id, escola, porcentagem, semana, tipo, matriculados)
        VALUES (@id, @escola, @porcentagem, @semana, @tipo, @matriculados)
      `);
      
      const getMatriculaStmt = db.prepare('SELECT matriculados FROM escola_matriculas WHERE escola = ? AND tipo = ?');

      const insertMany = db.transaction((rows) => {
        for (const row of rows) {
          let matriculados = row.matriculados !== undefined && row.matriculados !== null 
            ? Math.max(0, parseInt(String(row.matriculados), 10) || 0)
            : null;
          
          if (matriculados === null) {
            const found = getMatriculaStmt.get(row.escola, row.tipo) as { matriculados?: number } | undefined;
            if (found && typeof found.matriculados === 'number') {
              matriculados = found.matriculados;
            }
          }

          insert.run({
            id: row.id,
            escola: row.escola,
            porcentagem: row.porcentagem,
            semana: row.semana,
            tipo: row.tipo,
            matriculados: matriculados
          });
        }
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
      const { escola, porcentagem, semana, matriculados, applyToAllPeriods, tipo } = req.body;
      const numMatriculados = matriculados !== undefined && matriculados !== null && matriculados !== ''
        ? Math.max(0, parseInt(String(matriculados), 10) || 0)
        : null;

      db.prepare('UPDATE frequencia SET escola = ?, porcentagem = ?, semana = ?, matriculados = ? WHERE id = ?')
        .run(escola, porcentagem, semana, numMatriculados, id);

      if (applyToAllPeriods && tipo && escola && numMatriculados !== null) {
        db.prepare('INSERT OR REPLACE INTO escola_matriculas (escola, tipo, matriculados) VALUES (?, ?, ?)')
          .run(escola, tipo, numMatriculados);
        db.prepare('UPDATE frequencia SET matriculados = ? WHERE escola = ? AND tipo = ?')
          .run(numMatriculados, escola, tipo);
      }

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
      db.prepare('UPDATE escola_matriculas SET escola = ? WHERE tipo = ? AND escola = ?').run(newEscola, tipo, oldEscola);
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
      db.prepare('DELETE FROM escola_matriculas WHERE tipo = ? AND escola = ?').run(tipo, escola);
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
