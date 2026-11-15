-- Réplica local de la tabla que sincronizaba AnalisisStrava (RutasMap solo la lee).
-- Las tablas rutasmap_* las crea la API automáticamente (api/_db.ts -> setupDB).

CREATE TABLE IF NOT EXISTS strava_activities (
  id                   BIGINT PRIMARY KEY,
  name                 TEXT NOT NULL,
  sport_type           TEXT,
  type                 TEXT,
  start_date_local     TIMESTAMP,
  distance             DOUBLE PRECISION,
  moving_time          INTEGER,
  total_elevation_gain DOUBLE PRECISION,
  elev_high            DOUBLE PRECISION,
  elev_low             DOUBLE PRECISION,
  summary_polyline     TEXT
);

CREATE INDEX IF NOT EXISTS idx_strava_activities_date ON strava_activities(start_date_local DESC);

-- Datos de ejemplo alrededor de Medellín
INSERT INTO strava_activities
  (id, name, sport_type, type, start_date_local, distance, moving_time, total_elevation_gain, elev_high, elev_low, summary_polyline)
VALUES
  (1001, 'Cerro El Volador', 'Hike', 'Hike', '2026-09-06 07:10:00', 6200, 6300, 310, 1820, 1510, '_age@jcglMeCkBsCw@oCP}B~A}A|C{@|De@|Da@bDq@~BoAbBmBzA_CfBwBdCuAbD_@vD^vDtAbDvBdC~BfBlBzAnAbBp@~B`@bDd@|Dz@|D|A|C|B~AnCPrCw@dCkBrB{BdBkB`BaAlBU`CHtCJ|COnCaAjB{Bx@mDBgEe@gEw@uDo@}CQmCPmCn@}Cv@uDd@gECgEy@mDkB{BoCaA}COuCJaCHmBUaBaAeBkBsB{B'),
  (1002, 'Alto de Las Palmas trail', 'TrailRun', 'Run', '2026-09-13 06:00:00', 18400, 7900, 1050, 2520, 1480, 'g|zd@f_elMQcCMyBIoBAeBF}ATuAb@mAp@eAbA_AtAy@fBu@vBq@hCo@zCo@hDo@vDo@bEs@lEu@tE{@zE_A|EeA|EmAzEuAtE}AlEgBbEqBvD{BfDeCxCoCfCyCtBcDbBkDrAuD`A}Dn@eE`@mERsEFwEA{EI_FMaFQcFOcFMaFG_F?{EHwETqEb@kEr@cEdA{DvAsDhBiDxBaDjCwCzCmCjDaCxDwBdEoBnEeBvE{AzEsA|EkA|EeAxE_ArEy@jEu@`Eq@tDo@fDo@vCo@dCq@rBs@`Bw@pA{@~@aAn@gA^oAPwAD_B'),
  (1003, 'Vuelta Santa Elena', 'Ride', 'Ride', '2026-09-20 05:45:00', 42500, 8100, 1280, 2560, 1490, 'ws}d@zaukMuJoDcKgCkKsAoKUkKn@_KxBmJ`EuIdGyH`IyGpJ{FtK_FjLgErLuDpLmDdLkDrKqD|J}DjJmEzIaFpIqFpI}FvIcGfJaG|JsFvK{ErLwDnMkCdNuAvN]`O\`OtAvNjCdNvDnMzErLrFvK`G|JbGfJ|FvIpFpI`FpIlEzI|DjJpD|JjDrKlDdLtDpLfErL~EjLzFtKxGpJxH`ItIdGlJ`E~JxBjKn@nKUjKsAbKgCtJoDdJgEvIsEhIoE`IcE|HmD|HsCbI{BnIeBzIwAhJsAtJ{AzJoB|JoCtJyDdJiFjI_HhHuI~FgKnEuL|CyMjBsNz@cORgOKcOc@yNo@iNq@yMk@iM]}LIwLHwL\}Lj@iMp@yMn@iNb@yNJcOSgO{@cOkBsN}CyMoEuL_GgKiHuIkI_HeJiFuJyD}JoC{JoBuJ{AiJsA{IwAoIeBcI{B}HsC}HmDaIcEiIoEwIsEeJgE'),
  (1004, 'Cerro Tutelar Nutibara', 'Run', 'Run', '2026-10-04 06:30:00', 7800, 2700, 180, 1640, 1490, 'waae@nmflMoD{AyDe@uD`@cDnBcClDcBnEkAtEcAdEmAhDcBtCyBpCeC~CyBzDuAxE]jF\jFtAxExBzDdC~CxBpCbBtClAhDbAdEjAtEbBnEbClDbDnBtD`@xDe@nD{A|CqBnCiBlCmAtCk@dDWrD[vD{@fDmBbCgDpAuE\qFMuFa@gFa@sEMeELeE`@sE`@gFLuF]qFqAuEcCgDgDmBwD{@sD[eDWuCk@mCmAoCiB}CqB'),
  (1005, 'Parque Arví senderismo', 'Hike', 'Hike', '2026-10-18 08:00:00', 11300, 12600, 420, 2600, 2300, '_qie@n`vkMiEcFaFgDkFkAaF`@eEpC{CpFiBtH{@rI[lIQfH]pFaAvDqBhCgDnBsEpBiFhCeFrDaE`FaCjGm@`Hl@`H`CjG`E`FdFrDhFhCrEpBfDnBpBhC`AvD\pFPfHZlIz@rIhBtHzCpFdEpC`F`@jFkA`FgDhEcFlDwFrCaFdCkDfCcBzCWxDb@|EdAzFbAjG\bGc@`FuBfDgE|AmGNyHu@kIgBaI_CcHwB}FsA{E]gE\gErA{EvB}F~BcHfBaIt@kIOyH}AmGgDgEaFuBcGc@kG\{FbA}EdAyDb@{CWgCcBeCkDsCaFmDwF'),
  (1006, 'Cerro Quitasol', 'Hike', 'Hike', '2026-11-01 06:15:00', 9100, 14400, 1150, 2850, 1480, '_zve@f{alMGoAEeA?}@Hs@Rk@`@c@n@[`AUpAQbBMtBIdCGtCGbDInDKxDO~DSbEYbE_@`Eg@|Do@tDy@jDaA~CkAnCuA~B_BnBiB|AsBjA{Bz@cCj@kC\qCNwCD{CA_DEaDGaDGaDC_DB}CLyCXsCd@mCt@eCfA}BvAuBhBkBzBcBjCyAxCoAfDeArD{@zDs@`Ei@bEa@bE[`EUzDOpDKfDIxCGjCGxBIhBKvAOdASt@Yd@a@Vi@Jq@')
ON CONFLICT (id) DO NOTHING;
