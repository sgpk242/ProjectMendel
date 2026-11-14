-- Mendel — drop theses.confidence
--
-- A numeric confidence turned out not to be useful when recording a call;
-- the claim, what would change my mind, the review date and the evidence
-- linked for and against carry the signal instead.

alter table theses drop column confidence;
