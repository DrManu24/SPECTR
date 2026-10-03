"""
Parse a pre-randomized sequence CSV and return validated rows.

Expected columns (case-insensitive, leading/trailing whitespace stripped):
    sequence_number  – positive integer, unique within the file
    kit_code         – blinded kit identifier for the treatment arm (e.g. "TRL-4821")
    site             – enrolling site name or code
    strata           – stratum label (column may also be named ``strat`` for legacy files)
    treatment_arm    – display name of the treatment arm (e.g. "Drug A")

Arm validation is intentionally NOT performed here; the caller decides
whether to cross-check against study arms.
"""

from __future__ import annotations

import csv
import io
from typing import TypedDict

from .csv_limits import ensure_csv_size


REQUIRED_COLUMNS = {"sequence_number", "kit_code", "site", "treatment_arm"}
STRAT_COLUMN_NAMES = ("strata", "strat")


class ParsedRow(TypedDict):
    sequence_number: int
    kit_code: str
    site: str
    strat: str
    treatment_name: str


def _strat_column_name(normalised_headers: set[str]) -> str | None:
    for name in STRAT_COLUMN_NAMES:
        if name in normalised_headers:
            return name
    return None


def parse_randomization_csv(content: bytes) -> list[ParsedRow]:
    """
    Parse *content* (raw bytes of a CSV file) and return a list of ParsedRow
    dicts.  Raises ``ValueError`` with a human-readable message on any problem.
    """
    try:
        text = content.decode("utf-8-sig")  # handle BOM from Excel
    except UnicodeDecodeError:
        raise ValueError("File must be UTF-8 encoded.")

    ensure_csv_size(content)

    reader = csv.DictReader(io.StringIO(text))

    if reader.fieldnames is None:
        raise ValueError("CSV file appears to be empty or has no header row.")

    normalised_headers = {h.strip().lower() for h in reader.fieldnames}
    missing = REQUIRED_COLUMNS - normalised_headers
    if missing:
        raise ValueError(
            f"CSV is missing required column(s): {', '.join(sorted(missing))}. "
            "Expected: sequence_number, kit_code, site, strata, treatment_arm."
        )

    strat_column = _strat_column_name(normalised_headers)
    if strat_column is None:
        raise ValueError(
            "CSV is missing required column 'strata' (or legacy 'strat'). "
            "Expected: sequence_number, kit_code, site, strata, treatment_arm."
        )

    rows: list[ParsedRow] = []
    seen_sequence: set[int] = set()

    for line_num, raw_row in enumerate(reader, start=2):  # line 1 = header
        row = {k.strip().lower(): (v.strip() if v else "") for k, v in raw_row.items()}

        seq_str = row.get("sequence_number", "")
        if not seq_str:
            raise ValueError(f"Row {line_num}: 'sequence_number' is empty.")
        try:
            seq = int(seq_str)
        except ValueError:
            raise ValueError(
                f"Row {line_num}: 'sequence_number' must be an integer, got '{seq_str}'."
            )
        if seq < 1:
            raise ValueError(
                f"Row {line_num}: 'sequence_number' must be a positive integer, got {seq}."
            )
        if seq in seen_sequence:
            raise ValueError(
                f"Row {line_num}: duplicate 'sequence_number' {seq} in this file."
            )
        seen_sequence.add(seq)

        kit_code = row.get("kit_code", "")
        if not kit_code:
            raise ValueError(f"Row {line_num}: 'kit_code' is empty.")

        site = row.get("site", "")
        if not site:
            raise ValueError(f"Row {line_num}: 'site' is empty.")

        strat = row.get(strat_column, "")
        if not strat:
            raise ValueError(f"Row {line_num}: '{strat_column}' is empty.")

        treatment_name = row.get("treatment_arm", "")
        if not treatment_name:
            raise ValueError(f"Row {line_num}: 'treatment_arm' is empty.")

        rows.append(
            ParsedRow(
                sequence_number=seq,
                kit_code=kit_code,
                site=site,
                strat=strat,
                treatment_name=treatment_name,
            )
        )

    if not rows:
        raise ValueError("CSV file contains no data rows.")

    return rows
