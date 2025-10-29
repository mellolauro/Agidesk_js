import axios from "axios";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
// import { OpenAI } from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const AGIDESK_BASE_URL = process.env.AGIDESK_BASE_URL || "https://cnc.agidesk.com/api/v1";
const AGIDESK_APP_KEY = process.env.AGIDESK_APP_KEY;
//const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
//const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-3.5-turbo";
const TARGET_TITLE = process.env.TARGET_TITLE || "Central de Serviços";
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-1.5-flash";

let LAST_ANALYZED_ID = parseInt(process.env.LAST_ANALYZED_ID || "0", 10);

// const client = new OpenAI({ apiKey: OPENAI_API_KEY });
const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: MODEL_NAME });

const CACHE_FILE = path.resolve("./cache.json");

function carregarCache() {
    try {
    if (fs.existsSync(CACHE_FILE)) {
        return JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
    }
    return {};
    } catch (err) {
    console.error("⚠️ Erro ao carregar cache:", err.message);
    return {};
    }
}

function salvarCache(cache) {
    try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8");
    } catch (err) {
    console.error("⚠️ Erro ao salvar cache:", err.message);
    }
}

export function atualizarEnv(novoId) {
    const envPath = ".env";
    let lines = [];

    if (fs.existsSync(envPath)) {
    lines = fs.readFileSync(envPath, "utf-8").split("\n");
    }

    let updated = false;
    lines = lines.map((line) => {
    if (line.startsWith("LAST_ANALYZED_ID=")) {
        updated = true;
        return `LAST_ANALYZED_ID=${novoId}`;
    }
    return line;
    });

    if (!updated) {
    lines.push(`LAST_ANALYZED_ID=${novoId}`);
    }

    fs.writeFileSync(envPath, lines.join("\n"), "utf-8");
    console.log(`💾 Atualizado LAST_ANALYZED_ID para ${novoId}`);
}

export async function carregarDados() {
    const API_URL = `${AGIDESK_BASE_URL}/datasets/serviceissues?app_key=${AGIDESK_APP_KEY}&metadata&pretty&per_page=1000&page=1&forecast=teams&extrafield=all`;

    try {
        console.log(`Iniciando busca na API Agidesk... ID mínimo: ${LAST_ANALYZED_ID}`);
        const response = await axios.get(API_URL);
        const chamados = response.data?.data || [];

        console.log(`📦 Total de chamados retornados: ${chamados.length}`);

        // Verifica quais campos existem (debug)
        if (chamados.length > 0) {
            const exemplo = chamados[0];
            console.log("🔍 Exemplo de campos:", Object.keys(exemplo).slice(0, 10));
        }

        const filtrados = chamados.filter((c) => {
            const titleMatch = (c.title || "").trim().toLowerCase() === (TARGET_TITLE || "").trim().toLowerCase();
            const idMatch = parseInt(c.id) > LAST_ANALYZED_ID;
            const statusValue = (c.status_name || c.status || c.status_label || "").trim().toLowerCase();
            const statusMatch = statusValue === "em atendimento";

            // Log de debug para entender o que está vindo
            if (titleMatch && idMatch) {
                console.log(`🧾 [${c.id}] Status detectado: "${statusValue}"`);
            }

            return titleMatch && idMatch && statusMatch;
        });

        if (filtrados.length > 0) {
            filtrados.sort((a, b) => parseInt(a.id) - parseInt(b.id));
            console.log(`🔎 ${filtrados.length} novos chamados "Em atendimento" encontrados.`);
        } else {
            console.log("Nenhum novo chamado 'Em atendimento' encontrado.");
        }

        return filtrados;
    } catch (err) {
        console.error("❌ Erro ao buscar dados da API:", err.message);
        return [];
    }
}

async function gerarParecer(chamado) {
    const chamadoId = chamado.id;
    const cache = carregarCache();

    if (cache[chamadoId]) {
    console.log(`♻️ Parecer em cache para o chamado ${chamadoId}`);
    return cache[chamadoId].parecer;
    }

    const conteudo = chamado.content || "";
    const titulo = chamado.subject || chamado.title || "Chamado Desconhecido";

    const systemPrompt = `
Você é um especialista técnico responsável por gerar um parecer objetivo e profissional.
Com base nas informações do solicitante, produza:
1. **Justificativa:** descreva o propósito, viabilidade técnica e complexidade (Baixa, Média, Alta).
2. **Considerações Finais:** conclua de forma breve se é viável, depende de validação ou precisa de mais informações.
Caso faltem dados, cite quais informações faltam.
Texto curto e direto (máx. 2 parágrafos).
`;

    const userPrompt = `
📌 Chamado ID: ${chamadoId}
Título: ${titulo}

Conteúdo do chamado:
${conteudo}
`;

    try {
    //const completion = await client.chat.completions.create({
    //    model: OPENAI_MODEL,
    //    messages: [
    //    { role: "system", content: systemPrompt },
    //    { role: "user", content: userPrompt },
    //    ],
    //});

    //const parecer = completion.choices[0].message.content.trim();
    const prompt = `${systemPrompt}\n\n${userPrompt}`;

    const result = await model.generateContent(prompt);
    const parecer = result.response.text().trim();

    cache[chamadoId] = {
        parecer,
        dataGeracao: new Date().toISOString(),
    };
    salvarCache(cache);

    console.log(`✨ Parecer gerado e salvo no cache para o chamado ${chamadoId}`);
    return parecer;
    } catch (err) {
    console.error(`⚠️ Erro ao gerar parecer (${chamadoId}):`, err.message);
    return "[Erro ao gerar parecer técnico]";
    }
}

export async function gerarParecerHTML(chamado) {
    const parecerTexto = await gerarParecer(chamado);
    const data = new Date().toLocaleDateString("pt-BR");

    return `
    <div style="font-family: Arial; width: 800px; border: 1px solid #000; padding: 10px;">
    <h3 style="text-align:center;">TEXTO PARECER TÉCNICO</h3>
    <p><b>ATD:</b> ${chamado.id} | <b>Data:</b> ${data}</p>
    <p><b>Título:</b> ${chamado.title}</p>
    <p><b>Análise:</b> ${parecerTexto}</p>
    <hr>
    <p style="font-size:12px;color:#555;">Parecer gerado automaticamente.</p>
    </div>
    `;
}

export async function enviarParecerParaAgidesk(chamadoId, parecerHtml) {
    if (!AGIDESK_APP_KEY) {
    console.error("❌ Erro: AGIDESK_APP_KEY ausente. Não foi possível enviar o parecer.");
    return null;
    }

    const endpoint = `${AGIDESK_BASE_URL}/comments/?app_key=${AGIDESK_APP_KEY}`;
    const payload = {
    htmlcontent: parecerHtml,
    tasks: chamadoId,
    privacy_id: 2,
    };

    try {
    const response = await axios.post(endpoint, payload);
    console.log(`✅ Parecer enviado com sucesso para o chamado ${chamadoId}`);
    return response.data;
    } catch (err) {
    console.error(`❌ Falha ao enviar parecer (${chamadoId}): ${err.message}`);
    if (err.response) {
        console.error("🔍 Detalhe da resposta:", err.response.data);
    }
    return null;
    }
}