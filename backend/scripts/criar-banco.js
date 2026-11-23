// ============================================================================
// Cria o banco do Origem num PostgreSQL vazio (ex.: o Neon, em produção).
//
// Localmente quem faz isso é o docker compose: ele roda os arquivos de sql/ na
// primeira subida. Num banco gerenciado não há esse gatilho, então este script
// roda os MESMOS arquivos, na mesma ordem (a ordem alfabética, igual à do
// Docker: 01_schema, 01b_extensoes_u2, 02_seed, 03_fila).
//
// Uso:
//   DATABASE_URL="postgres://...neon.tech/neondb?sslmode=require" npm run banco:criar
//
// Se o banco já tiver as tabelas, o script PARA sem mexer em nada (e sai com
// erro, para avisar quem rodou à mão). Opções:
//   --se-vazio     sai SEM erro quando as tabelas já existem. É o que o Render
//                  roda antes de subir a API: na primeira subida cria tudo, nas
//                  seguintes só confere e segue.
//   --apagar-tudo  apaga tudo e recria do zero (perde pedidos, cadastros e
//                  avaliações feitos lá): npm run banco:criar -- --apagar-tudo
//
// Tudo roda numa TRANSAÇÃO só: se um arquivo falhar no meio, o ROLLBACK desfaz
// os anteriores e o banco continua vazio. Sem isso, as tabelas do 01_schema
// ficariam criadas sem o seed, e a próxima subida acharia que está tudo pronto.
// ============================================================================

import { readdirSync, readFileSync } from "node:fs";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Defina DATABASE_URL (o endereço do banco onde criar as tabelas).");
  process.exit(1);
}

const PASTA = new URL("../sql/", import.meta.url);
const arquivos = readdirSync(PASTA).filter((nome) => nome.endsWith(".sql")).sort();
const apagarTudo = process.argv.includes("--apagar-tudo");
const seVazio = process.argv.includes("--se-vazio");

const cliente = new pg.Client({ connectionString: url });
await cliente.connect();
try {
  const { rows } = await cliente.query("SELECT to_regclass('public.usuario') IS NOT NULL AS existe");
  if (rows[0].existe && !apagarTudo) {
    if (seVazio) {
      console.log("O banco já tem as tabelas do Origem: nada a criar.");
    } else {
      console.error("O banco já tem as tabelas do Origem. Nada foi feito.");
      console.error("Para apagar tudo e recriar: npm run banco:criar -- --apagar-tudo");
      process.exitCode = 1;
    }
  } else {
    await cliente.query("BEGIN");
    try {
      if (apagarTudo) {
        console.log("Apagando o schema public inteiro…");
        await cliente.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
      }
      for (const nome of arquivos) {
        console.log(`Rodando sql/${nome}…`);
        await cliente.query(readFileSync(new URL(nome, PASTA), "utf8"));
      }
      await cliente.query("COMMIT");
    } catch (erro) {
      await cliente.query("ROLLBACK");
      console.error("Falhou, e nada foi gravado (ROLLBACK).");
      throw erro;
    }
    const { rows: contagem } = await cliente.query(
      "SELECT (SELECT COUNT(*) FROM produto)::int AS produtos, (SELECT COUNT(*) FROM usuario)::int AS usuarios",
    );
    console.log(`Pronto: ${contagem[0].produtos} produtos e ${contagem[0].usuarios} usuários.`);
  }
} finally {
  await cliente.end();
}
