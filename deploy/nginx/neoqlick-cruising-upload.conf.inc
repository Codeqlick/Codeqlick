
    # Cruising's photo and video uploads (architecture 4.15, phase 4): up to 100 MB on this one
    # route (101m with the multipart envelope), streamed to the website's route handler; every other
    # request keeps 1 MB. Any two-letter locale (Neoqlick has six languages).
    location ~ "^/[a-z]{2}/cruising/api/media$" {
        client_max_body_size 101m;
        proxy_request_buffering off;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        proxy_pass http://127.0.0.1:@WEB_PORT@;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
