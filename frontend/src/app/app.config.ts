import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { clientIdInterceptor } from './core/client-id.interceptor';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // withComponentInputBinding: route params and query params arrive as component `input()`s.
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([clientIdInterceptor])),
  ],
};
