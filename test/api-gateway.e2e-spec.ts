import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ClientProxy } from '@nestjs/microservices';
import request from 'supertest';
import { of } from 'rxjs';
import { Server } from 'node:http';
import { ApiGatewayModule } from '../apps/api-gateway/src/api-gateway.module';
import { RpcToHttpExceptionFilter } from '../apps/api-gateway/src/filters/rpc-exception.filter';

describe('API Gateway (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let authClient: Pick<ClientProxy, 'send'>;
  let testsClient: Pick<ClientProxy, 'send'>;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'e2e-secret-with-at-least-32-characters';

    authClient = { send: jest.fn() };
    testsClient = { send: jest.fn() };
    const inertClient = { send: jest.fn() };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ApiGatewayModule],
    })
      .overrideProvider('AUTH_SERVICE')
      .useValue(authClient)
      .overrideProvider('USERS_SERVICE')
      .useValue(inertClient)
      .overrideProvider('TESTS_SERVICE')
      .useValue(testsClient)
      .overrideProvider('AI_SERVICE')
      .useValue(inertClient)
      .overrideProvider('MAIL_SERVICE')
      .useValue(inertClient)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new RpcToHttpExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
    delete process.env.JWT_SECRET;
  });

  beforeEach(() => jest.clearAllMocks());

  it('expone un health check real del gateway', async () => {
    const response = await request(server).get('/api/v1/health').expect(200);

    expect(response.text).toContain('"status":"ok"');
    expect(response.text).toContain('"service":"api-gateway"');
    expect(response.text).toMatch(/"timestamp":"\d{4}-\d{2}-\d{2}T/);
  });

  it('rechaza un registro inválido antes de llamar a Auth', async () => {
    await request(server)
      .post('/api/v1/auth/register')
      .send({ email: 'no-es-un-correo', fullname: 'A', password: '123' })
      .expect(400);

    expect(authClient.send).not.toHaveBeenCalled();
  });

  it('valida y reenvía un registro válido al microservicio Auth', async () => {
    const downstreamResponse = {
      message: 'Si la cuenta puede registrarse, recibirá un código por correo.',
    };
    (authClient.send as jest.Mock).mockReturnValueOnce(of(downstreamResponse));

    const body = {
      email: 'ada@example.com',
      fullname: 'Ada Lovelace',
      password: 'Password123!',
    };
    const response = await request(server)
      .post('/api/v1/auth/register')
      .send(body)
      .expect(201);

    expect(response.text).toBe(JSON.stringify(downstreamResponse));
    expect(authClient.send).toHaveBeenCalledWith(
      { cmd: 'auth.register' },
      body,
    );
  });

  it('sirve el catálogo público mediante Tests', async () => {
    const simulators = [{ slug: 'software', careerName: 'Software' }];
    (testsClient.send as jest.Mock).mockReturnValueOnce(of(simulators));

    const response = await request(server)
      .get('/api/v1/career-simulators')
      .expect(200);

    expect(response.text).toBe(JSON.stringify(simulators));
    expect(testsClient.send).toHaveBeenCalledWith(
      { cmd: 'tests.get-simulators' },
      {},
    );
  });

  it('protege las rutas de usuario sin JWT', () =>
    request(server).get('/api/v1/users/profile').expect(401));
});
