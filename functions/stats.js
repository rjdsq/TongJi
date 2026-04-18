export async function onRequest(context) {
    const { request, env, waitUntil } = context;
    const url = new URL(request.url);
    const action = url.searchParams.get('action');
    const site = url.searchParams.get('site') || 'default';

    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    const k_config = "all_sites_config";
    let configStr = await env.RE_STAT.get(k_config);
    let allConfigs = configStr ? JSON.parse(configStr) : {};

    if (action === 'get_configs') {
        return new Response(JSON.stringify(allConfigs), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    if (action === 'save_config' && request.method === 'POST') {
        let newConf = {};
        try { newConf = await request.json(); } catch(e) {}
        if (newConf.site) {
            allConfigs[newConf.site] = newConf;
            await env.RE_STAT.put(k_config, JSON.stringify(allConfigs));
        }
        return new Response(JSON.stringify({status: "ok"}), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    if (action === 'script') {
        const conf = allConfigs[site] || { align: 'center', pv: '总访问', uv: '总访客', dpv: '今日访问', duv: '今日访客' };
        const alignRule = conf.align === 'center' ? 'justify-content: center;' : (conf.align === 'right' ? 'justify-content: flex-end;' : 'justify-content: flex-start;');

        const trackerJs = `
        (async function() {
            const container = document.getElementById('cf-stat');
            if (!container) return;
            const apiUrl = '${url.origin}/stats?action=track&site=${site}';
            let resData = {};
            try {
                const response = await fetch(apiUrl, { method: 'POST', body: JSON.stringify({ url: window.location.href }) });
                resData = await response.json();
            } catch(e) { return; }

            container.innerHTML = \`<div style="display:flex; flex-wrap:wrap; gap:12px; font-family:-apple-system,sans-serif; \${alignRule}">
                <div style="background:#f9f7f2; padding:12px 16px; border-radius:12px; border:1px solid #ece9e0;"><div style="font-size:11px; color:#a5acaa; margin-bottom:4px;">${conf.pv}</div><div style="font-size:18px; color:#788583; font-weight:600;">\${resData.pv}</div></div>
                <div style="background:#f9f7f2; padding:12px 16px; border-radius:12px; border:1px solid #ece9e0;"><div style="font-size:11px; color:#a5acaa; margin-bottom:4px;">${conf.uv}</div><div style="font-size:18px; color:#788583; font-weight:600;">\${resData.uv}</div></div>
                <div style="background:#f9f7f2; padding:12px 16px; border-radius:12px; border:1px solid #ece9e0;"><div style="font-size:11px; color:#a5acaa; margin-bottom:4px;">${conf.dpv}</div><div style="font-size:18px; color:#788583; font-weight:600;">\${resData.dpv}</div></div>
                <div style="background:#f9f7f2; padding:12px 16px; border-radius:12px; border:1px solid #ece9e0;"><div style="font-size:11px; color:#a5acaa; margin-bottom:4px;">${conf.duv}</div><div style="font-size:18px; color:#788583; font-weight:600;">\${resData.duv}</div></div>
            </div>\`;
        })();`;
        return new Response(trackerJs, { headers: { "Content-Type": "application/javascript", ...corsHeaders } });
    }

    const dateStr = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }).split(' ')[0];
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    const k_pv = `s_${site}_pv`;
    const k_uv = `s_${site}_uv`;
    const k_dpv = `s_${site}_dpv_${dateStr}`;
    const k_duv = `s_${site}_duv_${dateStr}`;
    const k_ipe = `s_${site}_ipe_${ip}`;
    const k_ipt = `s_${site}_ipt_${dateStr}_${ip}`;

    if (action === 'track' && request.method === 'POST') {
        const [v_pv, v_uv, v_dpv, v_duv, v_ipe, v_ipt] = await Promise.all([
            env.RE_STAT.get(k_pv), env.RE_STAT.get(k_uv), env.RE_STAT.get(k_dpv), env.RE_STAT.get(k_duv), env.RE_STAT.get(k_ipe), env.RE_STAT.get(k_ipt)
        ]);

        let pv = parseInt(v_pv || "0") + 1;
        let dpv = parseInt(v_dpv || "0") + 1;
        let uv = parseInt(v_uv || "0");
        let duv = parseInt(v_duv || "0");
        const tasks = [env.RE_STAT.put(k_pv, pv.toString()), env.RE_STAT.put(k_dpv, dpv.toString(), { expirationTtl: 86400 * 30 })];

        if (!v_ipe) { uv++; tasks.push(env.RE_STAT.put(k_uv, uv.toString())); tasks.push(env.RE_STAT.put(k_ipe, "1")); }
        if (!v_ipt) { duv++; tasks.push(env.RE_STAT.put(k_duv, duv.toString(), { expirationTtl: 86400 * 2 })); tasks.push(env.RE_STAT.put(k_ipt, "1", { expirationTtl: 86400 * 2 })); }

        waitUntil(Promise.all(tasks));
        return new Response(JSON.stringify({ pv, uv, dpv, duv }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    if (action === 'get_stats') {
        const [v_pv, v_uv, v_dpv, v_duv] = await Promise.all([
            env.RE_STAT.get(k_pv), env.RE_STAT.get(k_uv), env.RE_STAT.get(k_dpv), env.RE_STAT.get(k_duv)
        ]);
        return new Response(JSON.stringify({ pv: v_pv || 0, uv: v_uv || 0, dpv: v_dpv || 0, duv: v_duv || 0 }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    return new Response("Invalid", { status: 400 });
}
