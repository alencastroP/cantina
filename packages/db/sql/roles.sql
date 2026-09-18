-- ---------------------------------------------------------------------------
-- Papéis de banco (§3 do PLAN.md)
--
-- Dois papéis, e a separação entre eles é o que faz o RLS valer alguma coisa:
--
--   cantina_app       sujeito a RLS. É o papel de 100% das rotas de tenant.
--                     Sem DDL, sem BYPASSRLS.
--   cantina_platform  BYPASSRLS. Só o módulo `platform`, as migrations e a
--                     resolução de host.
--
-- Rode com um superusuário. A senha aqui é de desenvolvimento — em produção
-- crie os papéis pelo provedor e guarde a senha no gerenciador de segredos.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cantina_app') THEN
    CREATE ROLE cantina_app LOGIN PASSWORD 'cantina';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cantina_platform') THEN
    CREATE ROLE cantina_platform LOGIN PASSWORD 'cantina' BYPASSRLS;
  END IF;
END
$$;

GRANT CONNECT ON DATABASE cantina TO cantina_app, cantina_platform;
GRANT USAGE ON SCHEMA public TO cantina_app, cantina_platform;

-- Nenhum dos dois cria tabela: DDL é exclusividade das migrations,
-- que rodam com o dono do banco.
REVOKE CREATE ON SCHEMA public FROM cantina_app, cantina_platform;
