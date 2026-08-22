import { redactSecretContent } from '@busos/memory';

const SECRET_LABEL_VALUE_RE = /(sk|pk|rk|api[_-]?key|apikey|password|passwd|secret|token|credential)\s*[:=]\s*\S+/gi;
const BEARER_TOKEN_RE =
  /\b(bearer|authorization)\b\s*(?:[:=]\s*)?(?:bearer\s+)?(?=[\p{L}\p{N}_.\-~+=]*[^\p{L}\s])[\p{L}\p{N}_.\-~+=]+/giu;

function show(label: string, content: string) {
  console.log(`\n[${label}]`);
  console.log(`  input : ${content}`);
  console.log(`  output: ${redactSecretContent(content)}`);
  const m = content.match(SECRET_LABEL_VALUE_RE) ?? content.match(BEARER_TOKEN_RE);
  console.log(`  matched: ${m ? JSON.stringify(m) : '(none)'}`);
}

show('MEM-17 actual content', '客户要求晚间沟通，服务密码 password=abc123，授权 Bearer xyz789。');
show('control Bearer:token', '授权 Bearer:xyz789');
show('control Bearer=token', '授权 Bearer=xyz789');
show('control Bearer token (space)', '授权 Bearer xyz789');
show('control api_key:xxx', 'api_key=sk-abcdef123456');
