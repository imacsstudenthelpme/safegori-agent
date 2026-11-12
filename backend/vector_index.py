"""Build and search the construction SIF passage index."""
import hashlib
import json
import os
import sys
import tempfile
from functools import lru_cache
from pathlib import Path

import numpy as np
from dotenv import load_dotenv
from openai import OpenAI

ROOT = Path(__file__).resolve().parents[1]
WORKBOOK = ROOT / 'ontology/SIF_20260401.xlsx'
INDEX = ROOT / 'local-db/sif-construction.npz'
BASE_URL = 'https://api.upstage.ai/v1'
load_dotenv(Path(__file__).with_name('.env'))


def models():
    return (os.getenv('EMBEDDING_MODEL_PASSAGE', 'solar-embedding-2-passage'),
            os.getenv('EMBEDDING_MODEL_QUERY', 'solar-embedding-2-query'))


def fingerprint():
    return hashlib.sha256(WORKBOOK.read_bytes() + json.dumps([1, *models()]).encode()).hexdigest()


def embed(texts, model):
    key = os.getenv('EMBEDDING_API_KEY')
    if not key:
        raise IndexUnavailable('임베딩 API 키를 설정해 주세요.')
    with OpenAI(api_key=key, base_url=BASE_URL, timeout=45, max_retries=3) as client:
        data = client.embeddings.create(input=texts, model=model).data
    data = sorted(data, key=lambda item: item.index)
    if [item.index for item in data] != list(range(len(texts))):
        raise ValueError('Incomplete embedding batch')
    vectors = np.array([item.embedding for item in data], dtype=np.float32)
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    if not np.isfinite(norms).all() or (norms == 0).any():
        raise ValueError('Invalid embedding')
    return vectors / norms


def corpus():
    sys.path.insert(0, str(ROOT / 'ontology'))
    from sif.read import read_workbook
    from sif.transform import Config

    rows, _ = read_workbook(WORKBOOK, Config.load(ROOT / 'ontology/config').columns)
    docs = {}
    for r in rows:
        if r['sector'] != 'C':
            continue
        docs.setdefault(r['id'], dict(
            id=r['id'], code=f"SIF-C-{int(r['serial']):04d}" if r['serial'].isdigit() else r['id'],
            file=WORKBOOK.name, sheet=r['sheet'], row=r['row'], work=r['uw'],
            object=r['co'], accident=r['at'], summary=r['summary'], hazard=r['hf'],
            measures=r['ms'], work_type=r['wt'], task=r['w'],
        ))
    return list(docs.values())


def passage(doc):
    labels = dict(work_type='공종', task='작업', work='단위작업', object='기인물',
                  accident='재해종류', summary='재해개요', hazard='유발요인', measures='예방대책')
    return '\n'.join(f'{label}: {doc[key]}' for key, label in labels.items() if doc[key])


def atomic_numpy(path, writer):
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as temp:
        temp_path = Path(temp.name)
        try:
            writer(temp)
            temp.flush()
            temp_path.replace(path)
        finally:
            temp_path.unlink(missing_ok=True)


def build():
    version = fingerprint()
    docs = corpus()
    cache = INDEX.parent / 'embedding-cache' / version
    cache.mkdir(parents=True, exist_ok=True)
    batches = []
    for start in range(0, len(docs), 32):
        texts = [passage(doc) for doc in docs[start:start + 32]]
        path = cache / f'{start}.npy'
        if not path.exists():
            vectors = embed(texts, models()[0])
            atomic_numpy(path, lambda f: np.save(f, vectors))
        batches.append(np.load(path, allow_pickle=False))
        print(f'{start + len(texts)}/{len(docs)}', flush=True)
    vectors = np.concatenate(batches)
    atomic_numpy(INDEX, lambda f: np.savez(f, version=version, vectors=vectors,
                                          docs=json.dumps(docs, ensure_ascii=False)))


class IndexUnavailable(RuntimeError):
    pass


@lru_cache(maxsize=1)
def read_index(version, modified):
    try:
        with np.load(INDEX, allow_pickle=False) as index:
            if index['version'].item() != version:
                raise IndexUnavailable('원본 또는 모델이 변경되었습니다. 벡터 인덱스를 다시 구축해 주세요.')
            docs = json.loads(index['docs'].item())
            vectors = index['vectors']
    except (OSError, ValueError, KeyError) as exc:
        raise IndexUnavailable('벡터 인덱스를 읽을 수 없습니다.') from exc
    if not docs or vectors.ndim != 2 or len(vectors) != len(docs):
        raise IndexUnavailable('벡터 인덱스 형식이 올바르지 않습니다.')
    return docs, vectors


def load_index():
    try:
        modified = INDEX.stat().st_mtime_ns
    except FileNotFoundError as exc:
        raise IndexUnavailable('벡터 인덱스를 먼저 구축해 주세요.') from exc
    return read_index(fingerprint(), modified)


def retrieve(query):
    docs, vectors = load_index()
    query_vector = embed([query], models()[1])[0]
    if vectors.shape[1] != len(query_vector):
        raise IndexUnavailable('검색 모델과 벡터 인덱스의 차원이 일치하지 않습니다.')
    ranked = np.argsort(-(vectors @ query_vector), kind='stable')[:10]
    return [docs[i] for i in ranked]


if __name__ == '__main__':
    build()
