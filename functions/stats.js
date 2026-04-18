export async function onRequest(context) {
    const { request, env } = context;
    const url = new URL(request.url);
    const isJsRequest = url.searchParams.has('js');

    const totalKey = "total_count";
    const todayDate = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }).split(' ')[0];
    const todayKey = `day_${todayDate}`;

    let total = parseInt(await env.RE_STAT.get(totalKey) || "0");
    let today = parseInt(await env.RE_STAT.get(todayKey) || "0");

    if (!isJsRequest) {
        total++;
        today++;
        await env.RE_STAT.put(totalKey, total.toString());
        await env.RE_STAT.put(todayKey, today.toString(), { expirationTtl: 172800 });
    }

    if (isJsRequest) {
        const jsCode = `
        (async function() {
            const res = await fetch('${url.origin}/stats');
            const data = await res.json();
            const container = document.getElementById('stat-card');
            if(!container) return;
            container.innerHTML = \`
                <div style="display:inline-flex;align-items:center;background:#f9f7f2;border:1px solid #ece9e0;border-radius:10px;padding:10px 18px;font-family:sans-serif;">
                    <div style="text-align:center;"><div style="font-size:10px;color:#a5acaa;">流年</div><div style="font-size:15px;color:#788583;">\${data.total}</div></div>
                    <div style="width:1px;height:20px;background:#edeae3;margin:0 15px;"></div>
                    <div style="text-align:center;"><div style="font-size:10px;color:#a5acaa;">今日</div><div style="font-size:15px;color:#788583;">\${data.today}</div></div>
                </div>\`;
        })();`;
        return new Response(jsCode, { headers: { "Content-Type": "application/javascript" } });
    }

    return new Response(JSON.stringify({ total, today }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
}