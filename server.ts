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
    console.log(`tcp/egress connected.. keepalive:${res.shouldKeepAlive}`);
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    tcpEgressOverHTTP = res;

    const wait = new Promise((resolve) => {setTimeout(() => {resolve(true)}, waitTimeout)});
    // hold connection open for a minute
    // do stuff...

    console.log('tcp/egress waiting');
    await wait
    tcpEgressOverHTTP = undefined;
    console.log('tcp/egress done');
    res.send();
  });

  app.post('/tcp/ingress', async (req: Request, res: Response) => {
    console.log(`tcp/ingress connected.. keepalive:${res.shouldKeepAlive}`);
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    const wait = new Promise((resolve) => {setTimeout(() => {resolve(true)}, waitTimeout)});

    tcpIngressOverHTTP = req.socket;

    tcpIngressOverHTTP.on("data", (chunk) => {
      console.log("tcpIngressOverHTTP receieved:", chunk.toString());
      if (tcpClient) {
        tcpClient.write(chunk);
      } else {
        console.log("no tcpClient to write to..");
      }
    })

    tcpIngressOverHTTP.on("end", () => console.log("tcpIngressOverHTTP end"));
    tcpIngressOverHTTP.on("close", () => console.log("tcpIngressOverHTTP close"));
    tcpIngressOverHTTP.on("error", (err) => console.log("tcpIngressOverHTTP error:" + JSON.stringify(err)));

    console.log('tcp/ingress waiting');
    await wait
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

main().catch(console.error);
