# Diagnostica rete — 2026-11-10

| Prova | Stato | Tipo | Byte | Inizio risposta | URL finale |
|---|---|---|---|---|---|
| ESPN NBA senza parametri | 200 | application/json;charset=UTF-8 | 191681 | `{"leagues":[{"id":"46","uid":"s:40~l:46","name":"National Basketball Association","abbreviation":"NBA","slug":"nba","season":{"year":2027,"startDate":"2026-09-3` | https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard |
| ESPN NBA data singola | 200 | application/json;charset=UTF-8 | 121354 | `{"leagues":[{"id":"46","uid":"s:40~l:46","name":"National Basketball Association","abbreviation":"NBA","slug":"nba","season":{"year":2027,"startDate":"2026-09-3` | https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=20261110 |
| ESPN NBA intervallo + limit | 400 | application/json;charset=UTF-8 | 55 | `{"code":400,"message":"Failed to get events endpoint."}` | https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=20261107-202 |
| ESPN NBA intervallo, UA browser | 400 | application/json;charset=UTF-8 | 55 | `{"code":400,"message":"Failed to get events endpoint."}` | https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=20261107-202 |
| ESPN Serie A senza parametri | 200 | application/json;charset=UTF-8 | 55937 | `{"leagues":[{"id":"730","uid":"s:600~l:730","name":"Italian Serie A","abbreviation":"Serie A","midsizeName":"ITA.1","slug":"ita.1","season":{"year":2026,"startD` | https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/scoreboard |
| ESPN Serie A intervallo | 400 | application/json;charset=UTF-8 | 55 | `{"code":400,"message":"Failed to get events endpoint."}` | https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/scoreboard?dates=20261107-20261 |
| ESPN tennis ATP | 200 | application/json;charset=UTF-8 | 118357 | `{"leagues":[{"id":"851","uid":"s:850~l:851","name":"ATP","abbreviation":"ATP","midsizeName":"ATP","slug":"atp","season":{"year":2026,"startDate":"2026-01-01T08:` | https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard |
| ESPN core API NBA | 200 | application/json;charset=utf-8 | 729 | `{"count":6,"pageIndex":1,"pageSize":25,"pageCount":1,"items":[{"$ref":"http://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/events/401909960?lang=en` | https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/events?dates=20261110 |
| ESPN cdn NBA | 200 | application/json;charset=utf-8 | 360667 | `{"news":{"link":{"isExternal":false,"shortText":"All News","rel":["index","desktop","league"],"language":"en-US","href":"https://www.espn.com/nba/","text":"All ` | https://cdn.espn.com/core/nba/scoreboard?xhr=1 |
| Understat pagina | 200 | text/html | 26719 | `<!DOCTYPE html> <html> <head> <title>Understat.com</title> <meta charset="UTF-8" /> <meta name="viewport" content="width=device-width,maximum-scale=1.0,initial-` | https://understat.com/league/Serie_A/2026 |
| Understat API | 200 | text/html | 26719 | `<!DOCTYPE html> <html> <head> <title>Understat.com</title> <meta charset="UTF-8" /> <meta name="viewport" content="width=device-width,maximum-scale=1.0,initial-` | https://understat.com/getLeagueData/Serie_A/2026 |
| tennis-data http xlsx | 403 | text/html; charset=UTF-8 | 4919 | `<!DOCTYPE html> <!--[if lt IE 7]> <html class="no-js ie6 oldie" lang="en-US"> <![endif]--> <!--[if IE 7]> <html class="no-js ie7 oldie" lang="en-US"> <![endif]-` | http://www.tennis-data.co.uk/2026/2026.xlsx |
| tennis-data https xlsx | 403 | text/html; charset=UTF-8 | 4919 | `<!DOCTYPE html> <!--[if lt IE 7]> <html class="no-js ie6 oldie" lang="en-US"> <![endif]--> <!--[if IE 7]> <html class="no-js ie7 oldie" lang="en-US"> <![endif]-` | https://www.tennis-data.co.uk/2026/2026.xlsx |
| tennis-data indice | 403 | text/html; charset=UTF-8 | 6033 | `<!DOCTYPE html> <!--[if lt IE 7]> <html class="no-js ie6 oldie" lang="en-US"> <![endif]--> <!--[if IE 7]> <html class="no-js ie7 oldie" lang="en-US"> <![endif]-` | http://www.tennis-data.co.uk/alldata.php |
| tennis-data anno precedente | 403 | text/html; charset=UTF-8 | 4919 | `<!DOCTYPE html> <!--[if lt IE 7]> <html class="no-js ie6 oldie" lang="en-US"> <![endif]--> <!--[if IE 7]> <html class="no-js ie7 oldie" lang="en-US"> <![endif]-` | http://www.tennis-data.co.uk/2025/2025.xlsx |
| Sackmann ATP (GitHub) | 404 | text/plain; charset=utf-8 | 14 | `404: Not Found` | https://raw.githubusercontent.com/JeffSackmann/tennis_atp/master/atp_matches_2026.csv |
| Sackmann ATP anno prec. | 404 | text/plain; charset=utf-8 | 14 | `404: Not Found` | https://raw.githubusercontent.com/JeffSackmann/tennis_atp/master/atp_matches_2025.csv |
| NBA cdn calendario | 403 | text/html | 425 | `<HTML><HEAD> <TITLE>Access Denied</TITLE> </HEAD><BODY> <H1>Access Denied</H1> You don't have permission to access "http&#58;&#47;&#47;cdn&#46;nba&#46;com&#47;s` | https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json |
| NBA cdn scoreboard oggi | 403 | text/html | 445 | `<HTML><HEAD> <TITLE>Access Denied</TITLE> </HEAD><BODY> <H1>Access Denied</H1> You don't have permission to access "http&#58;&#47;&#47;cdn&#46;nba&#46;com&#47;s` | https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json |
| football-data fixtures | 200 (via 302) | text/csv | 45324 | `﻿Div,Date,Time,HomeTeam,AwayTeam,Referee,B365H,B365D,B365A,BFDH,BFDD,BFDA,BVH,BVD,BVA,BWH,BWD,BWA,PPH,PPD,PPA,SKBH,SKBD,SKBA,MaxH,MaxD,MaxA,AvgH,AvgD,AvgA,BFEH,` | https://football-data.co.uk/fixtures.csv |

## Campioni salvati in report/campioni
- espn_tennis_atp_ieri: 200, 118297 byte
- espn_tennis_atp_oggi: 200, 118297 byte
- espn_tennis_wta_ieri: 200, 293673 byte
- espn_tennis_atp_giugno: 200, 1587151 byte
- espn_seriea_1: 200, 2568 byte
- espn_seriea_2: 200, 55873 byte
- espn_seriea_summary: 200, 432878 byte
- espn_nba_ieri: 200, 191621 byte
- espn_nba_summary_giocata: 200, 429940 byte
- espn_nba_domani: 200, 136630 byte
- espn_nba_summary_futura: 200, 116100 byte
- understat_api_xhr: 200, 26719 byte
- understat_pagina: 200, 26719 byte
- tennisdata_referer: 403, 4552 byte
