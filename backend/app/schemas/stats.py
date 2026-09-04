from datetime import date

from pydantic import BaseModel, ConfigDict


class RepeatedForgettingWordRead(BaseModel):
    word_id: int
    word: str
    forget_count_today: int
    total_forget_count: int

    model_config = ConfigDict(from_attributes=True)


class TodayStatsRead(BaseModel):
    date: date
    study_word_count: int
    forgetting_count: int
    repeated_forgetting_count: int
    streak_days: int
    total_study_count: int
    learning_word_count: int
    mastered_word_count: int
    forgotten_word_count: int
    repeated_forgetting_words: list[RepeatedForgettingWordRead]

    model_config = ConfigDict(from_attributes=True)
