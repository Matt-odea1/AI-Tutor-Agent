#!/usr/bin/env python3
"""AI Tutor — System Architecture (paper-quality)"""

from diagrams import Cluster, Diagram, Edge
from diagrams.aws.compute import EC2
from diagrams.aws.database import Dynamodb
from diagrams.aws.ml import Bedrock
from diagrams.aws.network import CloudFront
from diagrams.onprem.client import Users
from diagrams.onprem.database import Neo4J

GRAPH = {
    "fontsize": "22",
    "fontname": "Helvetica Neue",
    "bgcolor": "white",
    "rankdir": "TB",
    "nodesep": "1.6",
    "ranksep": "2.0",
    "splines": "curved",
    "pad": "1.4",
    "dpi": "180",
}
NODE = {"fontsize": "13", "fontname": "Helvetica Neue"}
CL = {"fontsize": "15", "fontname": "Helvetica Neue Bold",
      "style": "rounded", "penwidth": "2.0"}

with Diagram(
    "AI Tutor — System Architecture",
    filename="diagram_ai_tutor",
    outformat="png",
    show=False,
    graph_attr=GRAPH,
    node_attr=NODE,
    direction="TB",
):
    # ── Row 1: Actor ────────────────────────────────────────────────────────────
    user = Users("Student / Tutor")

    # ── Row 2: Frontend + Application Server (side by side) ────────────────────
    cf  = CloudFront("Frontend\nCloudFront + S3")
    api = EC2("FastAPI\nap-southeast-2")

    # ── Row 3: All services in one flat AWS cluster (side-by-side) ─────────────
    with Cluster("AWS Managed Services  ·  us-east-1",
                 graph_attr={**CL, "bgcolor": "#F8F8FF", "color": "#232F3E"}):
        # No edges between these nodes — guarantees same rank, side-by-side
        bedrock = Bedrock("Amazon Bedrock\nNova Lite · Cohere Embed")
        neo4j   = Neo4J("Neo4j\nVector Store")
        ddb     = Dynamodb("DynamoDB\nChat history")

    # ── Edges ───────────────────────────────────────────────────────────────────
    user >> Edge(color="#546E7A") >> cf
    user >> Edge(color="#1565C0", penwidth="2") >> api

    api >> Edge(label="RAG retrieval", color="#2E7D32") >> neo4j
    neo4j >> Edge(style="dashed", color="#2E7D32") >> api

    api >> Edge(label="LLM inference", color="#6A1B9A") >> bedrock
    bedrock >> Edge(style="dashed", color="#6A1B9A") >> api

    api >> Edge(color="#546E7A") >> ddb
