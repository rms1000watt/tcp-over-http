import net from 'net';
import express, { Request, Response } from 'express';

const app = express();
const portHttp = 3000;
const portTcp = 8000;
const waitTimeout = 60000;

let tcpIngressOverHTTP: net.Socket |  undefined = undefined;
let tcpEgressOverHTTP: Response | undefined = undefined;
let tcpClient: net.Socket | undefined = undefined;

async function main() {
  createExpressServer();
  createTCPServer();
}

function createExpressServer() {
  app.post('/tcp/egress', async (req: Request, res: Response) => {
    console.log(`tcp/egress connected`);

    tcpEgressOverHTTP = res;
    tcpEgressOverHTTP.flushHeaders();

    console.log('tcp/egress waiting');
    await new Promise((resolve) => {setTimeout(() => {resolve(true)}, waitTimeout)});
    // hold connection open for a minute
    // do stuff...

    tcpEgressOverHTTP = undefined;
    console.log('tcp/egress done');
    res.send();
  });

  app.post('/tcp/ingress', async (req: Request, res: Response) => {
    console.log(`tcp/ingress connected..`);
    res.flushHeaders();

    tcpIngressOverHTTP = req.socket;
    tcpIngressOverHTTP.on("data", (chunk: Buffer) => {
      const out = undoTransferEncodingChunk(chunk);

      // TODO: be smarter about this and omit all headers then start returning data
      if (out.toString() === `Transfer-Encoding: chunked\r\n\r\n`){
        return;
      }

      console.log("tcpIngressOverHTTP receieved:", out.toString());
      if (tcpClient) {
        tcpClient.write(out);
      } else {
        console.log("no tcpClient to write to..");
      }
    })

    tcpIngressOverHTTP.on("end", () => console.log("tcpIngressOverHTTP end"));
    tcpIngressOverHTTP.on("close", () => console.log("tcpIngressOverHTTP close"));
    tcpIngressOverHTTP.on("error", (err) => console.log("tcpIngressOverHTTP error:" + JSON.stringify(err)));

    console.log('tcp/ingress waiting');
    await new Promise((resolve) => {setTimeout(() => {resolve(true)}, waitTimeout)});

    tcpIngressOverHTTP = undefined;
    console.log('tcp/ingress done');
    res.send();
  });

  app.listen(portHttp, () => {
    console.log(`HTTP server: http://localhost:${portHttp}`);
  });
}

function createTCPServer() {
  const server = net.createServer((socket) => {
    console.log('TCP Client connected');
    tcpClient = socket;

    socket.on('data', (data) => {
      console.log(`tcpClient received: ${data.toString()}`);

      if (tcpEgressOverHTTP) {
        tcpEgressOverHTTP.write(data);
      } else {
        console.log("unable to write to tcpEgressOverHTTP.. does not exist")
      }
    });

    socket.on('end', () => {
      console.log('TCP Client disconnected');
      tcpClient = undefined;
    });

    socket.on('error', (err) => {
      console.error(`TCP Socket error: ${err.message}`);
      tcpClient = undefined;
    });
  });

  server.listen(portTcp, "localhost", () => {
    console.log(` TCP Server: localhost:${portTcp}`);
  });

  server.on('error', (err) => {
    console.error(`TCP Server error: ${err.message}`);
  });
}

function undoTransferEncodingChunk(chunk: Buffer) {
  const newlineIndex = chunk.indexOf('\r\n');
  if (newlineIndex !== -1) {
    return chunk.subarray(newlineIndex + 2);
  }
  return chunk;
}

main().catch(console.error);
