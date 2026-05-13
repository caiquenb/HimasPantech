const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// ─── Conexão com Supabase ─────────────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ─── USUÁRIOS ─────────────────────────────────────────────────────────────────

// GET /usuarios - lista todos os usuários (supervisor)
app.get('/usuarios', async (req, res) => {
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, login, usuario, setor, turno, perfil') // nunca retorna senha
    .order('usuario');

  if (error) {
    console.error('Erro ao buscar usuários:', error.message);
    return res.status(500).json({ error: 'Erro ao buscar usuários' });
  }
  res.json(data);
});

// POST /usuarios - cadastra novo usuário (supervisor)
app.post('/usuarios', async (req, res) => {
  const { login, senha, usuario, setor, turno, perfil } = req.body;

  const { data, error } = await supabase
    .from('usuarios')
    .insert([{ login, senha, usuario, setor, turno, perfil: perfil || 'operador' }])
    .select('id, login, usuario, setor, turno, perfil')
    .single();

  if (error) {
    console.error('Erro ao inserir usuário:', error.message);
    return res.status(500).json({ error: 'Erro ao inserir usuário' });
  }
  res.json(data);
});

// PUT /usuarios/:id - atualiza usuário (supervisor)
app.put('/usuarios/:id', async (req, res) => {
  const { id } = req.params;
  const { login, senha, usuario, setor, turno, perfil } = req.body;

  const atualizacao = { login, usuario, setor, turno, perfil };
  // Só atualiza senha se foi enviada
  if (senha && senha.trim() !== '') atualizacao.senha = senha;

  const { data, error } = await supabase
    .from('usuarios')
    .update(atualizacao)
    .eq('id', id)
    .select('id, login, usuario, setor, turno, perfil')
    .single();

  if (error) {
    console.error('Erro ao atualizar usuário:', error.message);
    return res.status(500).json({ error: 'Erro ao atualizar usuário' });
  }
  res.json({ success: true, data });
});

// DELETE /usuarios/:id - remove usuário (supervisor)
app.delete('/usuarios/:id', async (req, res) => {
  const { id } = req.params;

  const { error } = await supabase
    .from('usuarios')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Erro ao excluir usuário:', error.message);
    return res.status(500).json({ error: 'Erro ao excluir usuário' });
  }
  res.json({ success: true });
});

// POST /login - autentica usuário
app.post('/login', async (req, res) => {
  const { login, senha } = req.body;

  const { data, error } = await supabase
    .from('usuarios')
    .select('*')
    .eq('login', login)
    .eq('senha', senha)
    .single();

  if (error || !data) {
    return res.status(401).json({ erro: 'Usuário ou senha inválidos' });
  }

  // Nunca retorna a senha para o frontend
  const { senha: _, ...usuarioSemSenha } = data;
  res.json(usuarioSemSenha);
});

// ─── PRODUTO ──────────────────────────────────────────────────────────────────

// GET /api/produto/:codProducao
app.get('/api/produto/:codProducao', async (req, res) => {
  const { codProducao } = req.params;

  const { data, error } = await supabase
    .from('produto')
    .select('nome_produto, peso')
    .eq('codProducao', codProducao)
    .limit(1)
    .single();

  if (error || !data) {
    return res.status(404).json({ success: false, message: 'Produto não encontrado' });
  }

  res.json({ success: true, data });
});

// ─── PRODUÇÃO ─────────────────────────────────────────────────────────────────

// POST /api/formulario - insere dados de produção
app.post('/api/formulario', async (req, res) => {
  const {
    data, setor, turno, linha, codProducao, produto, peso, codigo_of,
    prodM, prodKg, refugo, motivoRefugo, retalhoM, retalhoKg, motivoRetalho,
    houveParada, usuario,
    codParada1, descParada1, hrsParada1,
    codParada2, descParada2, hrsParada2,
    codParada3, descParada3, hrsParada3,
    totalHorasParadas,
  } = req.body;

  const sanitizar = (val) => (val === '' || val === undefined ? null : val);

  const { error } = await supabase
    .from('producao')
    .insert([{
      data, setor, turno, linha, codProducao, produto, peso, codigo_of,
      prodM, prodKg, refugo, motivoRefugo, retalhoM, retalhoKg, motivoRetalho,
      houveParada: houveParada ?? 'Não', usuario: usuario || null,
      codParada1: sanitizar(codParada1), descParada1: sanitizar(descParada1), hrsParada1: sanitizar(hrsParada1),
      codParada2: sanitizar(codParada2), descParada2: sanitizar(descParada2), hrsParada2: sanitizar(hrsParada2),
      codParada3: sanitizar(codParada3), descParada3: sanitizar(descParada3), hrsParada3: sanitizar(hrsParada3),
      totalHorasParadas: sanitizar(totalHorasParadas),
    }]);

  if (error) {
    console.error('Erro ao salvar dados:', error.message);
    return res.status(500).json({ erro: 'Erro ao salvar dados' });
  }

  res.json({ success: true, message: 'Dados inseridos com sucesso!' });
});

// GET /api/producao/recentes - supervisor vê todos, operador filtra por setor e turno
app.get('/api/producao/recentes', async (req, res) => {
  const { perfil, setor, turno, limite } = req.query;

  let query = supabase
    .from('producao')
    .select('*')
    .order('id', { ascending: false })
    .limit(parseInt(limite) || 5);

  // Operador só vê registros do próprio setor e turno
  if (perfil === 'operador') {
    if (setor) query = query.eq('setor', setor);
    if (turno) query = query.eq('turno', turno);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Erro ao buscar produção recente:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }

  res.json({ success: true, data });
});

// GET /api/producao/total/:codProducao
app.get('/api/producao/total/:codProducao', async (req, res) => {
  const { codProducao } = req.params;

  const { data, error } = await supabase
    .from('producao')
    .select('codProducao, produto, prodM, prodKg')
    .eq('codProducao', codProducao);

  if (error) {
    return res.status(500).json({ success: false, message: 'Erro interno no servidor' });
  }
  if (!data || data.length === 0) {
    return res.status(404).json({ success: false, message: 'Produto não encontrado' });
  }

  const total_metros = data.reduce((acc, row) => acc + (parseFloat(row.prodM) || 0), 0);
  const total_kg = data.reduce((acc, row) => acc + (parseFloat(row.prodKg) || 0), 0);

  res.json({
    success: true,
    data: { codProducao: data[0].codProducao, produto: data[0].produto, total_metros, total_kg },
  });
});

// DELETE /api/producao/:id
app.delete('/api/producao/:id', async (req, res) => {
  const { id } = req.params;

  const { error } = await supabase
    .from('producao')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Erro ao excluir produção:', error.message);
    return res.status(500).json({ success: false });
  }

  res.json({ success: true });
});

// PUT /api/producao/:id
app.put('/api/producao/:id', async (req, res) => {
  const { id } = req.params;
  const dados = req.body;

  const { data, error } = await supabase
    .from('producao')
    .update({
      data: dados.data, linha: dados.linha, codProducao: dados.codProducao,
      produto: dados.produto, peso: dados.peso, codigo_of: dados.codigo_of,
      prodM: dados.prodM, prodKg: dados.prodKg, refugo: dados.refugo,
      motivoRefugo: dados.motivoRefugo, retalhoM: dados.retalhoM,
      retalhoKg: dados.retalhoKg, motivoRetalho: dados.motivoRetalho,
      houveParada: dados.houveParada,
      codParada1: dados.codParada1, descParada1: dados.descParada1, hrsParada1: dados.hrsParada1,
      codParada2: dados.codParada2, descParada2: dados.descParada2, hrsParada2: dados.hrsParada2,
      codParada3: dados.codParada3, descParada3: dados.descParada3, hrsParada3: dados.hrsParada3,
      totalHorasParadas: dados.totalHorasParadas, setor: dados.setor, turno: dados.turno,
    })
    .eq('id', id)
    .select();

  if (error) {
    console.error('Erro ao atualizar produção:', error.message);
    return res.status(500).json({ success: false, message: 'Erro no servidor.' });
  }

  if (!data || data.length === 0) {
    return res.json({ success: false, message: 'Registro não encontrado.' });
  }

  res.json({ success: true, message: 'Atualizado com sucesso!' });
});

// ─── DASHBOARD ───────────────────────────────────────────────────────────────
// Substitua a rota /api/dashboard existente no seu server.js por esta versão
// (antes do app.listen())

// GET /api/dashboard?dataInicio=&dataFim=&setor=&turno=
app.get('/api/dashboard', async (req, res) => {
  const { dataInicio, dataFim, setor, turno } = req.query;

  try {
    // Busca os registros aplicando todos os filtros disponíveis
    let query = supabase.from('producao').select('*');

    if (dataInicio) query = query.gte('data', dataInicio);
    if (dataFim)    query = query.lte('data', dataFim);
    if (setor)      query = query.eq('setor', setor);
    if (turno)      query = query.eq('turno', turno);

    const { data, error } = await query;

    if (error) {
      console.error('Erro ao buscar dados do dashboard:', error.message);
      return res.status(500).json({ success: false, message: 'Erro interno' });
    }

    const registros = data || [];
    const HORAS_TURNO = 8;

    // ── Totais gerais ──────────────────────────────────────────────────────
    const producaoTotal     = registros.reduce((a, r) => a + (parseFloat(r.prodKg)            || 0), 0);
    const refugoTotal       = registros.reduce((a, r) => a + (parseFloat(r.refugo)             || 0), 0);
    const retalhoTotal      = registros.reduce((a, r) => a + (parseFloat(r.retalhoKg)         || 0), 0);
    const horasParadasTotal = registros.reduce((a, r) => a + (parseFloat(r.totalHorasParadas) || 0), 0);
    const totalRegistros    = registros.length;
    const producaoTotalM = registros.reduce((a, r) => a + (parseFloat(r.prodM) || 0), 0);

    // ── KPIs principais ────────────────────────────────────────────────────
    const taxaRefugo       = producaoTotal > 0 ? (refugoTotal / producaoTotal) * 100 : 0;
    const taxaRetalho      = producaoTotal > 0 ? (retalhoTotal / producaoTotal) * 100 : 0;
    const indicePerdas     = producaoTotal > 0 ? ((refugoTotal + retalhoTotal) / producaoTotal) * 100 : 0;
    const eficiencia       = producaoTotal > 0 ? ((producaoTotal - refugoTotal) / producaoTotal) * 100 : 0;
    const tempoMedioParada = totalRegistros > 0 ? horasParadasTotal / totalRegistros : 0;
    const horasProducaoTotal = totalRegistros * HORAS_TURNO;
    const taxaProducao     = horasProducaoTotal > 0 ? producaoTotal / horasProducaoTotal : 0;

    // ── Busca lista de setores e turnos disponíveis para os filtros ────────
    const { data: todosDados } = await supabase
      .from('producao')
      .select('setor, turno');

    const setoresDisponiveis = [...new Set((todosDados || []).map(r => r.setor).filter(Boolean))].sort();
    const turnosDisponiveis  = [...new Set((todosDados || []).map(r => r.turno).filter(Boolean))].sort();

    // ── Agrupamento por turno ──────────────────────────────────────────────
    const porTurno = {};
    registros.forEach((r) => {
      const t = r.turno || 'Não informado';
      if (!porTurno[t]) porTurno[t] = { producao: 0, refugo: 0, retalho: 0, registros: 0, horasParadas: 0 };
      porTurno[t].producao     += parseFloat(r.prodKg)            || 0;
      porTurno[t].refugo       += parseFloat(r.refugo)             || 0;
      porTurno[t].retalho      += parseFloat(r.retalhoKg)         || 0;
      porTurno[t].horasParadas += parseFloat(r.totalHorasParadas) || 0;
      porTurno[t].registros    += 1;
    });

    const eficienciaPorTurno = Object.entries(porTurno).map(([turno, d]) => ({
      turno,
      producao:      parseFloat(d.producao.toFixed(2)),
      refugo:        parseFloat(d.refugo.toFixed(2)),
      retalho:       parseFloat(d.retalho.toFixed(2)),
      horasParadas:  parseFloat(d.horasParadas.toFixed(2)),
      eficiencia:    d.producao > 0 ? parseFloat(((d.producao - d.refugo) / d.producao * 100).toFixed(2)) : 0,
      produtividade: d.registros > 0 ? parseFloat((d.producao / (d.registros * HORAS_TURNO)).toFixed(2)) : 0,
    }));

    // ── Agrupamento por linha ──────────────────────────────────────────────
    const porLinha = {};
    registros.forEach((r) => {
      const l = r.linha || 'Não informado';
      if (!porLinha[l]) porLinha[l] = { producao: 0, refugo: 0, retalho: 0, registros: 0 };
      porLinha[l].producao  += parseFloat(r.prodKg)    || 0;
      porLinha[l].refugo    += parseFloat(r.refugo)     || 0;
      porLinha[l].retalho   += parseFloat(r.retalhoKg) || 0;
      porLinha[l].registros += 1;
    });

    const eficienciaPorLinha = Object.entries(porLinha).map(([linha, d]) => ({
      linha,
      producao:  parseFloat(d.producao.toFixed(2)),
      refugo:    parseFloat(d.refugo.toFixed(2)),
      retalho:   parseFloat(d.retalho.toFixed(2)),
      eficiencia: d.producao > 0 ? parseFloat(((d.producao - d.refugo) / d.producao * 100).toFixed(2)) : 0,
    }));

    // ── Tendência de refugo por data ───────────────────────────────────────
    // Agrupa por data e calcula taxa de refugo diária para mostrar tendência
    const porData = {};
    registros.forEach((r) => {
      const d = r.data;
      if (!porData[d]) porData[d] = { producao: 0, refugo: 0, retalho: 0 };
      porData[d].producao += parseFloat(r.prodKg) || 0;
      porData[d].refugo   += parseFloat(r.refugo)  || 0;
      porData[d].retalho  += parseFloat(r.retalhoKg) || 0;
    });

    const tendenciaRefugo = Object.entries(porData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([data, d]) => ({
        data,
        taxaRefugo:   d.producao > 0 ? parseFloat((d.refugo  / d.producao * 100).toFixed(2)) : 0,
        taxaRetalho:  d.producao > 0 ? parseFloat((d.retalho / d.producao * 100).toFixed(2)) : 0,
        refugoKg:     parseFloat(d.refugo.toFixed(2)),
        producaoKg:   parseFloat(d.producao.toFixed(2)),
      }));

// ── Por operador ──────────────────────────────────────────────────────────
const porOperador = {};
registros.forEach((r) => {
  const op = r.usuario || 'Não informado';
  if (!porOperador[op]) porOperador[op] = { usuario: op, producao: 0, registros: 0 };
  porOperador[op].producao  += parseFloat(r.prodKg) || 0;
  porOperador[op].registros += 1;
});
const producaoPorOperador = Object.values(porOperador)
  .sort((a, b) => b.producao - a.producao)
  .map(o => ({ ...o, producao: parseFloat(o.producao.toFixed(2)) }));

// ── Top 10 produtos ───────────────────────────────────────────────────
const porProduto = {};
registros.forEach((r) => {
  const key = r.produto || r.codProducao || 'Desconhecido';
  if (!porProduto[key]) porProduto[key] = { produto: key, prodKg: 0, prodM: 0, registros: 0 };
  porProduto[key].prodKg    += parseFloat(r.prodKg) || 0;
  porProduto[key].prodM     += parseFloat(r.prodM)  || 0;
  porProduto[key].registros += 1;
});

const top10Produtos = Object.values(porProduto)
  .sort((a, b) => b.prodKg - a.prodKg)
  .slice(0, 10)
  .map(p => ({ ...p, prodKg: parseFloat(p.prodKg.toFixed(2)), prodM: parseFloat(p.prodM.toFixed(2)) }));

    res.json({
      success: true,
      data: {
        // KPIs principais
        producaoTotal:     parseFloat(producaoTotal.toFixed(2)),
        producaoTotalM: parseFloat(producaoTotalM.toFixed(2)),  
        refugoTotal:       parseFloat(refugoTotal.toFixed(2)),
        retalhoTotal:      parseFloat(retalhoTotal.toFixed(2)),
        horasParadasTotal: parseFloat(horasParadasTotal.toFixed(2)),
        taxaRefugo:        parseFloat(taxaRefugo.toFixed(2)),
        taxaRetalho:       parseFloat(taxaRetalho.toFixed(2)),
        indicePerdas:      parseFloat(indicePerdas.toFixed(2)),
        eficiencia:        parseFloat(eficiencia.toFixed(2)),
        tempoMedioParada:  parseFloat(tempoMedioParada.toFixed(2)),
        taxaProducao:      parseFloat(taxaProducao.toFixed(2)),
        totalRegistros,
        top10Produtos,
        // Analíticos
        eficienciaPorTurno,
        eficienciaPorLinha,
        tendenciaRefugo,
        // Opções de filtro
        setoresDisponiveis,
        turnosDisponiveis,
        producaoPorOperador,
      },
    });
  } catch (err) {
    console.error('Erro no dashboard:', err);
    res.status(500).json({ success: false, message: 'Erro interno no servidor' });
  }
});

app.get('/api/metas', async (req, res) => {
  const { data, error } = await supabase
    .from('metas').select('*')
    .order('id', { ascending: false }).limit(1).single();
  if (error || !data) {
    return res.json({ success: true,
      data: { metaRefugo: null, metaRetalho: null, metaPerdas: null, metaEficiencia: null }
    });
  }
  res.json({ success: true, data: {
    metaRefugo: data.meta_refugo, metaRetalho: data.meta_retalho,
    metaPerdas: data.meta_perdas, metaEficiencia: data.meta_eficiencia,
  }});
});

app.put('/api/metas', async (req, res) => {
  const { metaRefugo, metaRetalho, metaPerdas, metaEficiencia } = req.body;
  const payload = {
    meta_refugo: metaRefugo ?? null, meta_retalho: metaRetalho ?? null,
    meta_perdas: metaPerdas ?? null, meta_eficiencia: metaEficiencia ?? null,
    updated_at: new Date().toISOString(),
  };
  const { data: existing } = await supabase.from('metas').select('id').limit(1).single();
  let result;
  if (existing) {
    result = await supabase.from('metas').update(payload).eq('id', existing.id).select().single();
  } else {
    result = await supabase.from('metas').insert([payload]).select().single();
  }
  if (result.error) return res.status(500).json({ success: false });
  res.json({ success: true, data: {
    metaRefugo: result.data.meta_refugo, metaRetalho: result.data.meta_retalho,
    metaPerdas: result.data.meta_perdas, metaEficiencia: result.data.meta_eficiencia,
  }});
});
// GET /api/operadores/:setor - busca operadores de um setor específico
app.get('/api/operadores/:setor', async (req, res) => {
  const { setor } = req.params;

  const { data, error } = await supabase
    .from('usuarios')
    .select('id, usuario')
    .eq('setor', setor)
    .eq('perfil', 'operador')
    .order('usuario');

  if (error) {
    console.error('Erro ao buscar operadores:', error.message);
    return res.status(500).json({ error: 'Erro ao buscar operadores' });
  }
  res.json({ success: true, data: data || [] });
});

// ─── INICIAR SERVIDOR ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Servidor backend rodando em http://localhost:${PORT}`);
});
