import express from "express";
import cron from "node-cron";
import { carregarDados, gerarParecerHTML, processarChamados, enviarParecerParaAgidesk, atualizarEnv } from "./agidesk_analise.js";
import dotenv from "dotenv";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

cron.schedule("*/10 * * * *", async () => {
    console.log("⏰ Executando verificação a cada 10 minutos...");
    await processarChamados();
});

const HTML_TEMPLATE = (chamados, dataAtual) => `
<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <title>Pareceres Técnicos - Agidesk</title>
    <style>
    body { font-family: Arial, sans-serif; background: #f4f4f9; margin: 0; padding: 20px; }
    h1 { text-align: center; }
    .chamado {
        background: #fff;
        border-radius: 12px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        padding: 20px;
        margin-bottom: 20px;
    }
    .chamado h2 { margin-top: 0; }
    .conteudo {
        background: #fcfcfc;
        border: 1px solid #ddd;
        padding: 10px;
        margin-top: 10px;
        white-space: pre-wrap;
        font-size: 14px;
    }
    .parecer {
        background: #f9f9f9;
        border-left: 4px solid #007bff;
        padding: 10px 15px;
        white-space: pre-wrap;
        margin-top: 10px;
    }
    .footer {
        text-align: center;
        color: #777;
        margin-top: 40px;
        font-size: 12px;
    }
    </style>
</head>
<body>
    <h1>📋 Pareceres Técnicos Gerados</h1>
    <p style="text-align:center; color:#555;">Última atualização: ${dataAtual}</p>

    ${chamados.length > 0 ? chamados.map(c => `
    <div class="chamado">
        <h2>#${c.id} — ${c.title}</h2>
        <p><b>Status:</b> ${c.status || "Desconhecido"}</p>
        <div class="conteudo"><b>Conteúdo do Chamado:</b><br>${c.content || "Sem conteúdo"}</div>
        <div class="parecer">
        <b>Parecer Técnico:</b><br>${c.parecer}
        </div>
    </div>
    `).join("") : `<p style="text-align:center;">Nenhum chamado novo para processar.</p>`}

    <div class="footer">
    Gerado automaticamente por Agidesk Analyzer — ${dataAtual}
    </div>
</body>
</html>
`;


app.get("/", async (req, res) => {
    console.log("🚀 Iniciando busca de novos chamados...");

    const chamados = await carregarDados();
    const processados = [];
    let ultimoId = null;

    for (const item of chamados) {
        const chamadoId = item.id;
        const titulo = item.title;
        const conteudo = item.content || "Sem conteúdo disponível";

        console.log(`🔧 Processando chamado ${chamadoId} - ${titulo}`);

        const parecerHtml = await gerarParecerHTML(item);
        await enviarParecerParaAgidesk(chamadoId, parecerHtml);

        processados.push({
            id: chamadoId,
            title: titulo,
            status: item.status,
            content: conteudo,
            parecer: parecerHtml
        });

        ultimoId = chamadoId;
    }

    if (ultimoId) atualizarEnv(ultimoId);

    const dataAtual = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    res.send(HTML_TEMPLATE(processados, dataAtual));
});

app.listen(PORT, () => {
    console.log(`✅ Servidor rodando em http://localhost:${PORT}`);
});