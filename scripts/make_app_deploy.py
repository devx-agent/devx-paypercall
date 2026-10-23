# Builds dist/app_deploy.js for the Cloudflare MCP `execute` tool: updates the EXISTING Worker devx-paypercall
# with the Arc Studio app (studio/appbuild/dist) embedded as gzip+base64 assets. Never creates/rebinds domains.
import json, os, gzip, base64, mimetypes, hashlib
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'app', 'dist')
assets = {}
for dp, _, fs in os.walk(root):
    for f in fs:
        p = os.path.join(dp, f); rel = '/' + os.path.relpath(p, root).replace(os.sep, '/')
        data = open(p, 'rb').read()
        ct = {'.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8','.svg':'image/svg+xml','.json':'application/json'}.get(os.path.splitext(f)[1], mimetypes.guess_type(f)[0] or 'application/octet-stream')
        assets[rel] = [ct, base64.b64encode(gzip.compress(data, 9)).decode(), hashlib.sha256(data).hexdigest()[:16]]
CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; "
       "img-src 'self' data: blob: https:; connect-src 'self' https://rpc.mainnet.arc.io https://rpc.testnet.arc.io https://tokencheck.madebydevx.com "
       "https://eth.merkle.io https://*.walletconnect.org https://*.walletconnect.com wss://*.walletconnect.org wss://*.walletconnect.com; "
       "frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
worker = "const A = " + json.dumps(assets) + ";\nconst CSP = " + json.dumps(CSP) + """;
const SEC = {'x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin','content-security-policy':CSP,'x-frame-options':'DENY'};
function b64(s){const b=atob(s);const u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u;}
export default { async fetch(req) {
  const u = new URL(req.url);
  if (u.pathname === '/robots.txt') return new Response('User-agent: *\\nAllow: /\\n', {headers:{'content-type':'text/plain'}});
  if (u.pathname === '/health') return Response.json({ok:true, app:'devx-paypercall', stage:'live', network:'arc-mainnet', contract:'0x21b9fad1c5eac36c687479d6bc8c8b088cbae9d1'});
  let p = u.pathname === '/' ? '/index.html' : u.pathname;
  let a = A[p];
  if (!a) { if (p.startsWith('/assets/') || p.includes('.')) return new Response('Not found', {status:404, headers:SEC}); a = A['/index.html']; p='/index.html'; }
  const immut = p.startsWith('/assets/');
  const h = {...SEC, 'content-type':a[0], 'etag':'"'+a[2]+'"', 'cache-control': immut ? 'public, max-age=31536000, immutable' : 'public, max-age=300'};
  if (req.headers.get('if-none-match') === '"'+a[2]+'"') return new Response(null, {status:304, headers:h});
  const ae = req.headers.get('accept-encoding') || '';
  if (/gzip/.test(ae)) return new Response(b64(a[1]), {headers:{...h,'content-encoding':'gzip','vary':'accept-encoding'}, encodeBody:'manual'});
  const ds = new Blob([b64(a[1])]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(ds, {headers:{...h,'vary':'accept-encoding'}});
} };"""
C = {"name": "devx-paypercall", "script": worker, "host": "paypercall.madebydevx.com"}
js = "async () => {\nconst C = " + json.dumps(C) + """;
const A = `/accounts/${accountId}`; const log = {};
const s = await cloudflare.request({method:'GET', path:`${A}/workers/scripts`});
if (!(s.result||[]).some(x=>x.id===C.name)) { log.abort = 'worker does not exist; this script only updates'; return log; }
const doms = await cloudflare.request({method:'GET', path:`${A}/workers/domains`});
const d = (doms.result||[]).find(x=>x.hostname===C.host);
if (!d || d.service !== C.name) { log.abort = 'host not bound to this worker'; return log; }
const metadata = { main_module:'worker.js', compatibility_date:'2025-09-01', bindings:[] };
const b = `----dx${Date.now()}`;
const body = [`--${b}`, 'Content-Disposition: form-data; name="metadata"', 'Content-Type: application/json', '', JSON.stringify(metadata),
  `--${b}`, 'Content-Disposition: form-data; name="worker.js"; filename="worker.js"', 'Content-Type: application/javascript+module', '', C.script, `--${b}--`, ''].join('\\r\\n');
const put = await cloudflare.request({method:'PUT', path:`${A}/workers/scripts/${C.name}`, body, contentType:`multipart/form-data; boundary=${b}`, rawBody:true});
log.put = {success:put.success, id:put.result && put.result.id, errors: put.errors, size: C.script.length};
log.domain = {hostname:d.hostname, service:d.service};
return log; }"""
os.makedirs('dist', exist_ok=True); open('dist/app_worker.js','w').write(worker); open('dist/app_deploy.js','w').write(js); print(len(assets), len(js))
