#!/usr/bin/env python3
"""Oral Assessment — System Architecture (paper-quality)"""

from diagrams import Cluster, Diagram, Edge
from diagrams.aws.compute import EC2
from diagrams.aws.database import Dynamodb
from diagrams.aws.general import InternetAlt1
from diagrams.aws.ml import Bedrock
from diagrams.aws.storage import S3
from diagrams.aws.integration import SQS
from diagrams.onprem.client import Users

GRAPH = {
    "fontsize": "22",
    "fontname": "Helvetica Neue",
    "bgcolor": "white",
    "rankdir": "TB",
    "nodesep": "1.3",
    "ranksep": "2.0",
    "splines": "curved",
    "pad": "1.4",
    "dpi": "180",
}
NODE = {"fontsize": "13", "fontname": "Helvetica Neue"}
CL = {"fontsize": "15", "fontname": "Helvetica Neue Bold",
      "style": "rounded", "penwidth": "2.0"}

with Diagram(
    "Oral Assessment — System Architecture",
    filename="diagram_oral_assessment",
    outformat="png",
    show=False,
    graph_attr=GRAPH,
    node_attr=NODE,
    direction="TB",
):
    # ── Row 1: Actors ──────────────────────────────────────────────────────────
    instructor = Users("Instructor")
    student    = Users("Student")

    # ── Row 2: Frontends ───────────────────────────────────────────────────────
    with Cluster("Frontend", graph_attr={**CL, "bgcolor": "#EEF4FB", "color": "#2C6FAC"}):
        s3_instr = S3("Instructor App")
        s3_stud  = S3("Student App")

    # ── Row 3: Application Server ──────────────────────────────────────────────
    with Cluster("Application Server  ·  ap-southeast-2",
                 graph_attr={**CL, "bgcolor": "#FFF8E7", "color": "#E65100"}):
        api = EC2("FastAPI")

    # ── Row 4: AWS Managed Services ────────────────────────────────────────────
    # No edges between these nodes so they share the same rank (horizontal row)
    # Defined left-to-right in desired display order
    with Cluster("AWS Managed Services  ·  us-east-1",
                 graph_attr={**CL, "bgcolor": "#F8F8FF", "color": "#232F3E"}):
        sqs      = SQS("SQS\nAsync job queue")
        deepgram = InternetAlt1("Deepgram\nSpeech-to-text")
        s3_audio = S3("S3\nAudio / Video")
        bedrock  = Bedrock("Amazon Bedrock\nQuestion gen · Evaluation")
        ddb      = Dynamodb("DynamoDB\nAssessments · Results")

    # ── Edges ──────────────────────────────────────────────────────────────────

    # Actors → Frontends
    instructor >> Edge(color="#546E7A") >> s3_instr
    student    >> Edge(color="#546E7A") >> s3_stud

    # Actors → API
    instructor >> Edge(color="#1565C0", penwidth="2") >> api
    student    >> Edge(color="#1565C0", penwidth="2") >> api

    # Instructor path — async question generation
    api >> Edge(label="async", color="#F57F17") >> sqs

    # Student path — transcription + evaluation
    api >> Edge(color="#546E7A") >> deepgram
    api >> Edge(color="#558B2F", style="dashed") >> s3_audio

    # LLM — serves both question gen (from SQS job) and evaluation
    api >> Edge(label="LLM", color="#6A1B9A") >> bedrock
    bedrock >> Edge(style="dashed", color="#6A1B9A") >> api

    # Persistence
    api >> Edge(color="#546E7A") >> ddb
