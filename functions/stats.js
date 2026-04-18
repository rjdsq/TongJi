export async function onRequest(context) {
    const { request, env, waitUntil } = context;
    const url = new URL(request.url);
    const action = url.searchParams.get('action');
    const site = url.searchParams.get('site') || '1';

    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    if (action === 'get_sys') {
        const pwd = await env.stat.get('sys_pwd');
        return new Response(JSON.stringify({ has_pwd: !!pwd }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    if (action === 'login' && request.method === 'POST') {
        let data = {};
        try { data = await request.json(); } catch(e) {}
        const pwd = await env.stat.get('sys_pwd');
        return new Response(JSON.stringify({ ok: data.pwd === pwd }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    if (action === 'save_sys' && request.method === 'POST') {
        let data = {};
        try { data = await request.json(); } catch(e) {}
        if (data.pwd) {
            await env.stat.put('sys_pwd', data.pwd);
        } else {
            await env.stat.delete('sys_pwd');
        }
        return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    const k_config = "all_sites_config";
    let configStr = await env.stat.get(k_config);
    let allConfigs = configStr ? JSON.parse(configStr) : {};

    if (action === 'clear_all' && request.method === 'POST') {
        const listed = await env.stat.list();
        const tasks = listed.keys.map(k => env.stat.delete(k.name));
        await Promise.all(tasks);
        return new Response(JSON.stringify({ status: "ok" }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    if (action === 'get_configs') {
        return new Response(JSON.stringify(allConfigs), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    if (action === 'save_config' && request.method === 'POST') {
        let newConf = {};
        try { newConf = await request.json(); } catch(e) {}
        if (newConf.site) {
            allConfigs[newConf.site] = newConf;
            await env.stat.put(k_config, JSON.stringify(allConfigs));
        }
        return new Response(JSON.stringify({status: "ok"}), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    if (action === 'delete_site' && request.method === 'POST') {
        let data = {};
        try { data = await request.json(); } catch(e) {}
        if (data.site && allConfigs[data.site]) {
            delete allConfigs[data.site];
            const tasks = [env.stat.put(k_config, JSON.stringify(allConfigs))];
            if (data.erase) {
                const listed = await env.stat.list({ prefix: `s_${data.site}_` });
                listed.keys.forEach(k => tasks.push(env.stat.delete(k.name)));
            }
            await Promise.all(tasks);
        }
        return new Response(JSON.stringify({status: "ok"}), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    if (action === 'script') {
        const conf = allConfigs[site] || { 
            position: 'bottom-left', brand: '#8da493',
            shows: {pv:true, uv:true, online:true, geo:true, dev:true} 
        };

        const posStyle = conf.position === 'bottom-right' ? 'bottom:20px; right:20px;' : 'bottom:20px; left:20px;';
        const brandStr = conf.brand || '#8da493';

        const trackerJs = `
        (async function() {
            const apiUrl = '${url.origin}/stats?action=track&site=${site}';
            let reqData = { url: window.location.href, ref: document.referrer };
            let resData = { pv:0, uv:0, online:1, geo:'未知', os:'未知' };
            try {
                const response = await fetch(apiUrl, { method: 'POST', body: JSON.stringify(reqData) });
                resData = await response.json();
            } catch(e) {}

            const wrap = document.createElement('div');
            wrap.id = 'cf-island-wrap';
            
            const css = \`
            #cf-island-wrap { position:fixed; \${'${posStyle}'} z-index:2147483647; font-family:-apple-system,sans-serif; --b:\${'${brandStr}'}; }
            .cf-island { display:flex; flex-direction:column; align-items:flex-start; background:rgba(255,255,255,0.85); backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px); border:1px solid rgba(0,0,0,0.08); border-radius:24px; padding:10px 14px; box-shadow:0 10px 30px rgba(0,0,0,0.08); color:#333; overflow:hidden; transition:all 0.4s cubic-bezier(0.175,0.885,0.32,1.275); cursor:pointer; min-width:80px; width:auto; height:44px; }
            .cf-island:hover, .cf-island.expanded { height:auto; padding:16px; border-radius:20px; }
            .cf-island-head { display:flex; align-items:center; gap:8px; white-space:nowrap; font-size:14px; font-weight:600; height:24px; width:100%; }
            .cf-dot { width:8px; height:8px; background:var(--b); border-radius:50%; animation:cf-pulse 2s infinite; }
            .cf-island-body { display:flex; flex-direction:column; gap:12px; margin-top:16px; opacity:0; transition:opacity 0.3s; width:100%; min-width:180px; }
            .cf-island:hover .cf-island-body, .cf-island.expanded .cf-island-body { opacity:1; }
            .cf-d-row { display:flex; justify-content:space-between; font-size:13px; border-bottom:1px dashed rgba(0,0,0,0.05); padding-bottom:6px; }
            .cf-d-lbl { color:#777; }
            .cf-d-val { font-weight:600; color:#111; }
            @keyframes cf-pulse { 0% { box-shadow:0 0 0 0 rgba(141,164,147,0.7); } 70% { box-shadow:0 0 0 6px rgba(141,164,147,0); } 100% { box-shadow:0 0 0 0 rgba(141,164,147,0); } }
            @media (prefers-color-scheme: dark) {
                .cf-island { background:rgba(30,30,30,0.85); border-color:rgba(255,255,255,0.1); color:#eee; box-shadow:0 10px 30px rgba(0,0,0,0.5); }
                .cf-d-row { border-color:rgba(255,255,255,0.08); }
                .cf-d-lbl { color:#aaa; }
                .cf-d-val { color:#fff; }
            }
            \`;
            
            const style = document.createElement('style');
            style.innerHTML = css;
            document.head.appendChild(style);

            const shows = ${JSON.stringify(conf.shows || {pv:true, uv:true, online:true, geo:true, dev:true})};
            let bodyHtml = '';
            if(shows.pv) bodyHtml += \`<div class="cf-d-row"><span class="cf-d-lbl">总访问量</span><span class="cf-d-val">\${resData.pv}</span></div>\`;
            if(shows.uv) bodyHtml += \`<div class="cf-d-row"><span class="cf-d-lbl">独立访客</span><span class="cf-d-val">\${resData.uv}</span></div>\`;
            if(shows.geo) bodyHtml += \`<div class="cf-d-row"><span class="cf-d-lbl">您的方位</span><span class="cf-d-val">\${resData.geo}</span></div>\`;
            if(shows.dev) bodyHtml += \`<div class="cf-d-row"><span class="cf-d-lbl">访问终端</span><span class="cf-d-val">\${resData.os}</span></div>\`;

            wrap.innerHTML = \`<div class="cf-island" onclick="this.classList.toggle('expanded')">
                <div class="cf-island-head"><div class="cf-dot"></div>\${shows.online ? '脉搏 ' + resData.online : '环境检测'}</div>
                <div class="cf-island-body">\${bodyHtml}</div>
            </div>\`;
            
            document.body.appendChild(wrap);
        })();`;
        return new Response(trackerJs, { headers: { "Content-Type": "application/javascript", ...corsHeaders } });
    }

    const dateStr = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }).split(' ')[0];
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';

    if (action === 'track' && request.method === 'POST') {
        let reqData = { ref: '' };
        try { reqData = await request.json(); } catch(e) {}

        const ua = request.headers.get('user-agent') || '';
        let os = '未知设备';
        if (/windows/i.test(ua)) os = 'Windows';
        else if (/mac os/i.test(ua)) os = 'macOS';
        else if (/android/i.test(ua)) os = 'Android';
        else if (/iphone|ipad/i.test(ua)) os = 'iOS';
        
        let refDomain = '直接访问';
        if (reqData.ref) {
            try { refDomain = new URL(reqData.ref).hostname; } catch(e) {}
        }

        const geo = request.cf && request.cf.country ? request.cf.country : '未知';

        const k_daily = `s_${site}_d_${dateStr}`;
        const k_total = `s_${site}_t`;
        const k_online = `s_${site}_p_${ip}`;

        let [dailyStr, totalStr] = await Promise.all([
            env.stat.get(k_daily),
            env.stat.get(k_total)
        ]);

        let daily = dailyStr ? JSON.parse(dailyStr) : { pv:0, uv:0, ips:[], os:{}, ref:{} };
        let total = totalStr ? JSON.parse(totalStr) : { pv:0, uv:0, ips:[] };

        daily.pv++;
        total.pv++;

        if (!daily.ips.includes(ip)) {
            daily.uv++;
            daily.ips.push(ip);
            daily.os[os] = (daily.os[os] || 0) + 1;
            daily.ref[refDomain] = (daily.ref[refDomain] || 0) + 1;
        }

        if (!total.ips.includes(ip)) {
            total.uv++;
            total.ips.push(ip);
        }

        const tasks = [
            env.stat.put(k_daily, JSON.stringify(daily), { expirationTtl: 86400 * 30 }),
            env.stat.put(k_total, JSON.stringify(total)),
            env.stat.put(k_online, Date.now().toString(), { expirationTtl: 300 })
        ];

        waitUntil(Promise.all(tasks));

        const listed = await env.stat.list({ prefix: `s_${site}_p_` });
        const onlineCount = listed.keys.length || 1;

        return new Response(JSON.stringify({ 
            pv: total.pv, uv: total.uv, dpv: daily.pv, duv: daily.uv, 
            online: onlineCount, geo: geo, os: os 
        }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    if (action === 'get_dashboard') {
        const listed = await env.stat.list({ prefix: 's_' });
        let result = { total: { pv:0, uv:0 }, sites: {} };
        const siteIds = Object.keys(allConfigs);

        for (let s of siteIds) {
            let totalStr = await env.stat.get(`s_${s}_t`);
            let dailyStr = await env.stat.get(`s_${s}_d_${dateStr}`);
            
            let t = totalStr ? JSON.parse(totalStr) : {pv:0, uv:0};
            let d = dailyStr ? JSON.parse(dailyStr) : {pv:0, uv:0, os:{}, ref:{}};
            
            let onlineList = await env.stat.list({ prefix: `s_${s}_p_` });
            
            result.sites[s] = {
                pv: t.pv, uv: t.uv, dpv: d.pv, duv: d.uv, 
                online: onlineList.keys.length,
                os: d.os, ref: d.ref
            };
            result.total.pv += t.pv;
            result.total.uv += t.uv;
        }
        return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    return new Response("Invalid", { status: 400 });
}
