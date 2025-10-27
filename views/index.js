import express from "express";
import dotenv from "dotenv";
import { carregarDados, gerarParecerHTML, enviarParecerParaAgidesk, atualizarEnv } from "./agidesk_analise.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.get("/", async (req, res) => {
    console.log("🚀 Buscando novos chamados...");
    const chamados = await carregarDados();

    const processados = [];
    let ultimoId = null;

    for (const chamado of chamados) {
    const parecerHtml = await gerarParecerHTML(chamado);
    await enviarParecerParaAgidesk(chamado.id, parecerHtml);
    processados.push({ ...chamado, parecer: parecerHtml });
    ultimoId = chamado.id;
    }

    if (ultimoId) atualizarEnv(ultimoId);

    res.send(`
    <h1>Pareceres Técnicos - Agidesk</h1>
    ${
        processados.length > 0
        ? processados
            .map(
                (c) => `
            <div style="border:1px solid #ccc; margin:10px; padding:10px;">
            <h3>#${c.id} - ${c.title}</h3>
            <p><b>Status:</b> ${c.status}</p>
            <div>${c.parecer}</div>
            </div>`
            )
            .join("")
        : "<p>Nenhum novo chamado encontrado.</p>"
    }
    `);
});

app.listen(PORT, () =>
    console.log(`✅ Servidor rodando em http://localhost:${PORT}`)
);
