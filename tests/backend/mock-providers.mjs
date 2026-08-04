import { createServer } from 'node:http';

let created = 0;
let lastStripeBody = '';
let emails = [];
const server = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (request.method === 'POST' && request.url === '/v1/checkout/sessions') {
    created += 1;
    lastStripeBody = Buffer.concat(chunks).toString('utf8');
    response.writeHead(200, { 'content-type': 'application/json' });
    return response.end(JSON.stringify({ id: `cs_live_synthetic_${created}`, url: `https://checkout.stripe.com/c/pay/cs_live_synthetic_${created}`, expires_at: Math.floor(Date.now() / 1000) + 1800 }));
  }
  if (request.method === 'GET' && request.url === '/last-stripe') {
    response.writeHead(200, { 'content-type': 'application/json' });
    return response.end(JSON.stringify({ body: lastStripeBody, created }));
  }
  if (request.method === 'GET' && request.url === '/emails') {
    response.writeHead(200, { 'content-type': 'application/json' });
    return response.end(JSON.stringify(emails));
  }
  if (request.method === 'POST' && /^\/v1\/checkout\/sessions\/cs_live_synthetic_\d+\/expire$/.test(request.url)) {
    response.writeHead(200, { 'content-type': 'application/json' });
    return response.end(JSON.stringify({ status: 'expired' }));
  }
  if (request.method === 'POST' && request.url === '/agentmail/inboxes/pedidos%40mereonhealth.com/messages/send') {
    emails.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    response.writeHead(200, { 'content-type': 'application/json' });
    return response.end(JSON.stringify({ message_id: 'msg_synthetic_internal' }));
  }
  response.writeHead(404, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ error: 'not_found' }));
});
server.listen(8788, '127.0.0.1');
