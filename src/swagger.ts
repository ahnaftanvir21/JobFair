import type { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
} from '@nestjs/swagger';
import {
  OPTIONAL_AUTH_API_EXTENSION,
  PUBLIC_API_EXTENSION,
} from './common/decorators/public.decorator.js';
import { UserRole } from './common/enums/index.js';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
const ALL_ROLES = Object.values(UserRole).map((role) => ({ [role]: [] }));

/**
 * Interactive API docs at /api/docs.
 *
 * There are three token boxes under "Authorize": student, employer and admin.
 * Each role-only route uses only its role's token, and shared routes accept any. The server checks the role
 * inside the token on every request, so a token in the wrong box still gets 403.
 */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('AIUB Job Fair 2026 API')
    .setDescription(
      'Students register, build profiles, apply for jobs and drop CVs. ' +
        'Employers build company profiles, post jobs with questions and review applicants ' +
        'once an admin approves their company. Admins review companies and see overall numbers.\n\n' +
        '**Tokens:** logging in or registering here fills the matching token box automatically. ' +
        'You can also paste a token under **Authorize**: a student token in "student", ' +
        'an employer token in "employer", an admin token in "admin". ' +
        'Admins log in with POST /auth/login; create one with npm run admin:create.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Token of a student account',
      },
      UserRole.STUDENT,
    )
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Token of an employer account',
      },
      UserRole.EMPLOYER,
    )
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Token of an admin account',
      },
      UserRole.ADMIN,
    )
    .build();

  SwaggerModule.setup(
    'api/docs',
    app,
    () => applyRouteSecurity(SwaggerModule.createDocument(app, config)),
    {
      swaggerOptions: {
        // Keep the tokens after a page refresh.
        persistAuthorization: true,
        // After login or registration, put the new token in the box for its role.
        // Runs in the browser, so it must not use anything from this file.
        responseInterceptor: function (res: {
          url: string;
          status: number;
          body?: unknown;
          text?: string;
        }) {
          try {
            if (
              res.status >= 200 &&
              res.status < 300 &&
              /\/api\/auth\/(login|register\/student|register\/employer)$/.test(
                res.url,
              )
            ) {
              const data = (
                res.body && typeof res.body === 'object'
                  ? res.body
                  : JSON.parse(res.text || '{}')
              ) as { accessToken?: string; user?: { role?: string } };
              const role = data.user && data.user.role;
              if (
                data.accessToken &&
                (role === 'student' || role === 'employer' || role === 'admin')
              ) {
                (
                  window as unknown as {
                    ui: {
                      preauthorizeApiKey(name: string, value: string): void;
                    };
                  }
                ).ui.preauthorizeApiKey(role, data.accessToken);
              }
            }
          } catch {
            // Never break the response display because of this helper.
          }
          return res;
        },
      },
      customSiteTitle: 'AIUB Job Fair API',
    },
  );
}

/**
 * Routes with @Roles already name their token box.
 * Public routes get no lock; every other route accepts any token.
 */
function applyRouteSecurity(doc: OpenAPIObject): OpenAPIObject {
  for (const pathItem of Object.values(doc.paths)) {
    for (const method of HTTP_METHODS) {
      const op = pathItem[method] as
        (Record<string, unknown> & { security?: unknown[] }) | undefined;
      if (!op) continue;
      if (op[OPTIONAL_AUTH_API_EXTENSION]) {
        // {} means "no token needed"; a token is still sent if one is set.
        op.security = [{}, ...ALL_ROLES];
        delete op[OPTIONAL_AUTH_API_EXTENSION];
      } else if (op[PUBLIC_API_EXTENSION]) {
        op.security = [];
        delete op[PUBLIC_API_EXTENSION];
      } else if (!op.security?.length) {
        op.security = ALL_ROLES;
      }
    }
  }
  return doc;
}
