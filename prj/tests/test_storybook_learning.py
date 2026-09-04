import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from storybook_learning import CHOICES_EP1, attach_learning, glossary_for_page, quiz_from_glossary


def test_glossary_matches_longest_phrase_first():
    text = "The Jade Emperor sat up. The monkey was brave."
    gloss = glossary_for_page(text)
    terms = {g["term"] for g in gloss}
    assert "Jade Emperor" in terms
    assert "brave" in terms


def test_quiz_dedupes_same_term():
    gloss = [
        {"term": "monkey", "zh": "猴子"},
        {"term": "Monkey", "zh": "猴子"},
        {"term": "waterfall", "zh": "瀑布"},
        {"term": "gibbon", "zh": "长臂猿"},
    ]
    quiz = quiz_from_glossary(gloss, n=5)
    prompts = [q["q"] for q in quiz]
    assert len(prompts) == len(set(prompts))
    assert len(quiz) == 3


def test_ep1_choices_attach_two_options():
    pages = [{"page_no": 11, "text_en": "Whoever can jump through will be our king."}]
    pages, _quiz = attach_learning(pages, choice_map=CHOICES_EP1)
    choice = pages[0]["choice"]
    assert len(choice["options"]) == 2
    assert choice["prompt"]
    assert all(opt.get("id") and opt.get("en") and opt.get("reply") for opt in choice["options"])


def test_quiz_has_one_correct_answer():
    gloss = [{"term": "stream", "zh": "小溪"}]
    quiz = quiz_from_glossary(gloss, n=1)
    assert len(quiz) == 1
    q = quiz[0]
    assert q["choices"][q["answer"]] == "小溪"
    assert len(q["choices"]) == 3
