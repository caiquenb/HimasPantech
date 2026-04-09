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

    res.json({
      success: true,
      data: {
        // KPIs principais
        producaoTotal:     parseFloat(producaoTotal.toFixed(2)),
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
        // Analíticos
        eficienciaPorTurno,
        eficienciaPorLinha,
        tendenciaRefugo,
        // Opções de filtro
        setoresDisponiveis,
        turnosDisponiveis,
      },
    });
  } catch (err) {
    console.error('Erro no dashboard:', err);
    res.status(500).json({ success: false, message: 'Erro interno no servidor' });
  }
});
