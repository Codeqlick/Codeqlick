import { describe, expect, it } from 'vitest';
import { routeWebapp, webappForHost, webappHost } from './webapps';

describe('web apps on subdomains', () => {
  it('finds the app of a host', () => {
    expect(webappForHost('videochat.codeqlick.com')).toBe('videochat');
    expect(webappForHost('videochat.localhost:3000')).toBe('videochat');
    expect(webappForHost('codeqlick.com')).toBeNull();
    expect(webappForHost('www.codeqlick.com')).toBeNull();
    expect(webappForHost(undefined)).toBeNull();
    expect(webappHost('videochat', 'www.codeqlick.com')).toBe('videochat.codeqlick.com');
  });

  it("opens the app at its host's home and keeps its pages and the sign-in ones", () => {
    const host = 'videochat.codeqlick.com';
    expect(routeWebapp('/es', host, 'https:')).toEqual({ action: 'redirect', to: '/es/videochat' });
    expect(routeWebapp('/en/', host, 'https:')).toEqual({
      action: 'redirect',
      to: '/en/videochat',
    });
    expect(routeWebapp('/es/videochat/room', host, 'https:')).toEqual({ action: 'pass' });
    expect(routeWebapp('/es/login', host, 'https:')).toEqual({ action: 'pass' });
    expect(routeWebapp('/es/register', host, 'https:')).toEqual({ action: 'pass' });
    expect(routeWebapp('/', host, 'https:')).toEqual({ action: 'pass' });
  });

  it("sends the site's other pages back to the main host", () => {
    expect(routeWebapp('/es/blog/post', 'videochat.codeqlick.com', 'https:')).toEqual({
      action: 'redirect',
      to: 'https://codeqlick.com/es/blog/post',
    });
    expect(routeWebapp('/es/portal', 'videochat.localhost:3000', 'http:')).toEqual({
      action: 'redirect',
      to: 'http://localhost:3000/es/portal',
    });
  });

  it("sends the app's pages on the main host to its subdomain", () => {
    expect(routeWebapp('/es/videochat/room', 'codeqlick.com', 'https:')).toEqual({
      action: 'redirect',
      to: 'https://videochat.codeqlick.com/es/videochat/room',
    });
    expect(routeWebapp('/en/videochat', 'localhost:3000', 'http:')).toEqual({
      action: 'redirect',
      to: 'http://videochat.localhost:3000/en/videochat',
    });
    expect(routeWebapp('/es/blog', 'codeqlick.com', 'https:')).toEqual({ action: 'pass' });
  });
});
