import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
  type ArgumentsHost,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ProblemDetailsFilter, type ErrorRecorder } from './problem-details.filter.js';

function hostFor(): {
  host: ArgumentsHost;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
} {
  const response = {
    headersSent: false,
    status: vi.fn(),
    type: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);
  response.type.mockReturnValue(response);
  const request = {
    id: 'req-7',
    method: 'POST',
    originalUrl: '/v1/leads?x=1',
    headers: { 'user-agent': 'test-agent' },
  };
  const host = {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ArgumentsHost;
  return { host, status: response.status, json: response.json };
}

describe('ProblemDetailsFilter', () => {
  it('records the unexpected errors for Admin → Errors', () => {
    const record = vi.fn<ErrorRecorder['record']>().mockResolvedValue();
    const filter = new ProblemDetailsFilter({ record });
    const { host, status } = hostFor();

    filter.catch(new TypeError('x is undefined'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'API',
        message: 'TypeError: x is undefined',
        method: 'POST',
        path: '/v1/leads',
        reference: 'req-7',
        userAgent: 'test-agent',
      }),
    );
  });

  it('leaves out the errors the API means to send, 5xx included', () => {
    const record = vi.fn<ErrorRecorder['record']>().mockResolvedValue();
    const filter = new ProblemDetailsFilter({ record });

    filter.catch(new NotFoundException(), hostFor().host);
    filter.catch(new ServiceUnavailableException('OVH is not set up'), hostFor().host);

    expect(record).not.toHaveBeenCalled();
  });

  it("keeps a file error's line and name", () => {
    const filter = new ProblemDetailsFilter();
    const { host, json } = hostFor();

    filter.catch(
      new BadRequestException({
        message: 'Validation failed',
        errors: [
          { path: 'content', line: 3, key: 'API_KEY', message: 'Already on line 1' },
          { path: 'content', line: 7, message: 'Expected KEY=value' },
        ],
      }),
      host,
    );

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 400,
        detail: 'Validation failed',
        errors: [
          { path: 'content', line: 3, key: 'API_KEY', message: 'Already on line 1' },
          { path: 'content', line: 7, message: 'Expected KEY=value' },
        ],
      }),
    );
  });
});
