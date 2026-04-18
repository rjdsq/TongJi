export async function onRequest(context) {
    const { request, env, waitUntil } = context;
    const url = new URL(request.url);
    const isJsRequest = url.searchParams.has('js');

    const ip = request.headers.get('cf-connecting-ip') || 'unknown';
    const country = request.cf?.country || '未知地域';
    const city = request.cf?.city || country;
    const geoText = city === country ? country : `${country} ${city}`;

    const dateStr = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }).split(' ')[0];
    
    const k_total_pv = "pv_total";
    const k_total_uv = "uv_total";
    const k_today_pv = `pv_${dateStr}`;
    const k_today_uv = `uv_${dateStr}`;
    const k_ip_ever = `ip_ever_${ip}`;
    const k_ip_today = `ip_today_${dateStr}_${ip}`;
    const k_last_geo = "last_geo";

    const [v_tpv, v_tuv, v_dpv, v_duv, v_ipe, v_ipt] = await Promise.all([
        env.RE_STAT.get(k_total_pv),
        env.RE_STAT.get(k_total_uv),
        env.RE_STAT.get(k_today_pv),
        env.RE_STAT.get(k_today_uv),
        env.RE_STAT.get(k_ip_ever),
        env.RE_STAT.get(k_ip_today)
    ]);

    let total_pv = parseInt(v_tpv || "0");
    let total_uv = parseInt(v_tuv || "0");
    let today_pv = parseInt(v_dpv || "0");
    let today_uv = parseInt(v_duv || "0");

    const writeTasks = [];

    if (!isJsRequest) {
        total_pv++;
        today_pv++;
        writeTasks.push(env.RE_STAT.put(k_total_pv, total_pv.toString()));
        writeTasks.push(env.RE_STAT.put(k_today_pv, today_pv.toString(), { expirationTtl: 172800 }));
        writeTasks.push(env.RE_STAT.put(k_last_geo, geoText));

        if (!v_ipe) {
            total_uv++;
            writeTasks.push(env.RE_STAT.put(k_total_uv, total_uv.toString()));
            writeTasks.push(env.RE_STAT.put(k_ip_ever, "1"));
        }
        if (!v_ipt) {
            today_uv++;
            writeTasks.push(env.RE_STAT.put(k_today_uv, today_uv.toString(), { expirationTtl: 172800 }));
            writeTasks.push(env.RE_STAT.put(k_ip_today, "1", { expirationTtl: 172800 }));
        }

        waitUntil(Promise.all(writeTasks));
    }

    if (isJsRequest) {
        const jsCode = `
        (async function() {
            const res = await fetch('${url.origin}/stats');
            const data = await res.json();
            const container = document.getElementById('stat-card');
            if(!container) return;
            container.innerHTML = \`
                <div style="background:#f9f7f2; border:1px solid #ece9e0; border-radius:12px; padding:16px 24px; font-family:-apple-system,sans-serif; color:#788583; display:inline-block; box-shadow: 0 4px 15px rgba(0,0,0,0.02);">
                    <div style="display:flex; justify-content:space-between; margin-bottom:12px; border-bottom:1px dashed #edeae3; padding-bottom:12px;">
                        <div style="text-align:center; padding:0 15px;">
                            <div style="font-size:11px; color:#a5acaa; margin-bottom:4px; letter-spacing:1px;">流年阅历 (PV)</div>
                            <div style="font-size:18px; font-weight:600;">\${data.total_pv}</div>
                        </div>
                        <div style="width:1px; background:#edeae3;"></div>
                        <div style="text-align:center; padding:0 15px;">
                            <div style="font-size:11px; color:#a5acaa; margin-bottom:4px; letter-spacing:1px;">独立灵魂 (UV)</div>
                            <div style="font-size:18px; font-weight:600;">\${data.total_uv}</div>
                        </div>
                    </div>
                    <div style="display:flex; justify-content:space-between; font-size:12px; color:#a0b5a6;">
                        <div>今日足迹: \${data.today_pv}</div>
                        <div style="margin-left:20px;">远方来客: \${data.last_geo}</div>
                    </div>
                </div>\`;
        })();`;
        return new Response(jsCode, { headers: { "Content-Type": "application/javascript" } });
    }

    const resData = { total_pv, total_uv, today_pv, today_uv, last_geo: await env.RE_STAT.get(k_last_geo) || geoText };
    return new Response(JSON.stringify(resData), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
}
